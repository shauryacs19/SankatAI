"""Feedback write path: anonymised row, PII scrub, re-vote/clear, bandit counters, validation."""

from __future__ import annotations

import json
import uuid

import pytest
from boto3.dynamodb.conditions import Key
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import config
from app.integrations.aws import dynamo_client
from app.ml.pii import scrub
from app.repositories import feedback_repository
from app.services import bandit_service, consultation_service, triage_service

USER = "user-fb-1"


@pytest.fixture
def env(aws, monkeypatch):
    from app.api.routes.consultations import router

    monkeypatch.setattr(config, "TRIAGE_FEEDBACK_TABLE", f"feedback-{uuid.uuid4().hex[:6]}")
    dynamo_client.ensure_tables()
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: False)  # template replies, real engine
    monkeypatch.setattr(consultation_service.language_service, "resolve_language", lambda *a: "en-IN")
    cid = consultation_service.create_consultation(USER, None)["consultationId"]
    out = consultation_service.post_message(
        USER, cid, "Sore throat since yesterday. Call me on +91 98765 43210 or ravi@example.com, my name is Ravi Kumar.")
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    def vote(body):
        return client.post(f"/api/consultations/{cid}/messages/{out['assistantMessage']['id']}/feedback",
                           json=body, headers={"x-user-id": USER})
    return vote, cid, json.loads(out["assistantMessage"]["content"])


def rows():
    table = dynamo_client.get_resource().Table(config.TRIAGE_FEEDBACK_TABLE)
    return [i for i in table.scan()["Items"] if i["pk"].startswith("FB#")]


def counts():
    bandit_service.reset_for_tests()  # read through the cache
    return feedback_repository.read_counts()


def test_yes_writes_an_anonymised_row(env):
    vote, cid, reply = env
    assert vote({"feedback": "like"}).status_code == 200
    [row] = rows()
    dump = json.dumps(row, default=str)
    assert USER not in dump and cid not in dump  # no user id, session id is a keyed hash
    assert "98765" not in dump and "ravi@example.com" not in dump and "Ravi Kumar" not in dump
    assert row["feedback"] == "yes" and row["session_id"] and row["message_ref"]
    assert "sore throat" in row["query"] and "[NUMBER]" in row["query"]
    assert row["features"] == json.loads(json.dumps(reply["triage"]["features"]), parse_float=type(row["confidence"]))
    assert row["model_version"] == reply["triage"]["modelVersion"] and row["prompt_variant"] == reply["triage"]["variant"]
    assert row["mode"] == reply["triage"]["mode"] and "created_at" in row and int(row["ttl"]) > 0
    assert counts()[f"prompt#{reply['triage']['variant']}"] == (1, 0)


def test_revote_with_reason_overwrites_and_moves_the_bandit_vote(env):
    vote, _, reply = env
    vote({"feedback": "like"})
    r = vote({"feedback": "dislike", "reason": "wrong_severity", "direction": "higher", "comment": "write to me at x@y.com"})
    assert r.status_code == 200 and r.json()["feedback"] == "dislike"
    [row] = rows()
    assert (row["feedback"], row["reason"], row["direction"]) == ("no", "wrong_severity", "higher")
    assert row["comment"] == "write to me at [EMAIL]"
    arm = f"prompt#{reply['triage']['variant']}"
    assert counts()[arm] == (0, 1)
    assert not [arm for arm in counts() if arm.startswith("slot#")]  # questions are the LLM's: only prompt arms


def test_adding_a_reason_later_does_not_double_count(env):
    vote, _, reply = env
    vote({"feedback": "dislike"})
    vote({"feedback": "dislike", "reason": "too_generic"})
    assert rows()[0]["reason"] == "too_generic"
    assert counts()[f"prompt#{reply['triage']['variant']}"] == (0, 1)


def test_clearing_the_vote_deletes_the_row_and_retracts(env):
    vote, _, reply = env
    vote({"feedback": "like"})
    assert vote({"feedback": None}).status_code == 200
    assert rows() == []
    assert counts()[f"prompt#{reply['triage']['variant']}"] == (0, 0)


@pytest.mark.parametrize("body", [
    {"feedback": "like", "reason": "too_generic"}, {"feedback": "dislike", "reason": "boring"},
    {"feedback": "dislike", "reason": "inaccurate", "direction": "higher"}, {"feedback": "dislike", "comment": "x" * 281},
])
def test_invalid_reasons_are_rejected(env, body):
    vote, _, _ = env
    assert vote(body).status_code == 422
    assert rows() == []


def test_store_failure_never_fails_the_vote(env, monkeypatch):
    vote, _, _ = env
    monkeypatch.setattr(feedback_repository, "put", lambda item: (_ for _ in ()).throw(RuntimeError("down")))
    assert vote({"feedback": "like"}).status_code == 200


def test_retraining_reads_by_month_partition(env):
    vote, _, _ = env
    vote({"feedback": "like"})
    from scripts.triage_ml.feedback_data import months_back, read_items

    table = dynamo_client.get_resource().Table(config.TRIAGE_FEEDBACK_TABLE)
    assert len(read_items(table, months_back(2))) == 1
    assert table.query(KeyConditionExpression=Key("pk").eq("BANDIT"))["Items"]


def test_scrub_keeps_vitals_and_removes_identifiers():
    out = scrub("My name is Asha Rao, aadhaar 1234 5678 9012, PAN ABCDE1234F, +91-98765-43210, "
                "see https://x.example/a. Temp 102.5 F, BP 120/80, SpO2 93, pain 7/10 for 3 days. I am feeling dizzy.")
    for gone in ("Asha", "1234 5678", "ABCDE1234F", "98765", "https://"):
        assert gone not in out
    for kept in ("102.5 F", "120/80", "SpO2 93", "7/10", "3 days", "I am feeling dizzy"):
        assert kept in out
