"""Questionnaire answers: the LLM's questions + what the person tapped/typed,
read into the severity model's features, stored with the message (API + guest)."""

from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ml import severity_model
from app.ml.features import Turn, build_features
from app.schemas.triage import Message, TriageAnswers
from app.services import consultation_service, triage_engine, triage_service
from tests.test_triage_engine import QUESTIONS, FakeProvider, Forced

USER = "user-qn-1"


def item(question, answer, kind="choice", i=1):
    return {"id": f"q{i}", "question": question, "answer": answer, "kind": kind}


def features(*items, note=None):
    return build_features([Turn("user", "I have a headache"), Turn("assistant", "?"),
                           Turn("user", "My answers: ...", answers=list(items), note=note)])


# --- answers -> features ---------------------------------------------------

def test_yes_no_answers_set_the_symptoms_their_question_names():
    f = features(item("Do you have a fever?", "Yes", "yes_no"), item("Is it hard to breathe?", "No", "yes_no", 2),
                 item("Are you vomiting?", "नहीं", "yes_no", 3))
    assert (f.flags["fever"], f.flags["breathing"], f.flags["vomiting"]) == (1, -1, -1)
    assert f.red_flags == []  # a "no" to a red-flag question never counts as having it


def test_a_yes_to_a_red_flag_question_is_an_emergency():
    severity_model.reset_for_tests(Forced("LOW", 0.99))
    msgs = [Message(role="user", content="I feel unwell"),
            Message(role="assistant", content=json.dumps({"followUpQuestions": ["Are your lips turning blue?"], "triage": {"mode": "ask"}})),
            Message(role="user", content="My answers: • Blue lips: Yes",
                    answers=TriageAnswers(items=[item("Are your lips turning blue?", "Yes", "yes_no")]))]
    r = triage_engine.run(msgs, None, provider=FakeProvider(), session_id="x").reply
    assert r["severity"] == "EMERGENCY" and "108" in r["advice"]


def test_the_question_tells_a_bare_answer_what_it_is():
    f = features(item("How long have you had it?", "1-3 days"), item("How old are you?", "45", "text", 2),
                 item("What does the thermometer show?", "about 101.5 F", "text", 3),
                 item("On a scale of 0-10 how bad is the pain?", "7", "choice", 4))
    assert (f.duration_band, f.age_band, f.pain_band) == ("days", "adult", "severe")
    assert abs(f.temp_c - 38.6) < 0.1  # the exact reading, not a band


def test_the_summary_text_is_not_parsed_but_the_note_is():
    # The summary line "Short of breath: No" would read as "breathing: yes" if parsed as free text.
    f = build_features([Turn("user", "cough"), Turn("assistant", "?"),
                        Turn("user", "My answers: • Short of breath: No",
                             answers=[item("Are you short of breath?", "No", "yes_no")], note="also my chest feels tight")])
    assert f.flags["breathing"] == -1
    assert "chest_pain" in f.red_flags  # "chest ... tight" in the note still counts


# --- API + guest ------------------------------------------------------------

def test_answers_are_stored_with_the_message_and_reach_the_engine(aws, monkeypatch):
    from app.api.routes.consultations import router

    severity_model.reset_for_tests(Forced("MODERATE", 0.4))
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    monkeypatch.setattr(triage_service, "get_provider", lambda: FakeProvider(QUESTIONS))
    monkeypatch.setattr(consultation_service.language_service, "resolve_language", lambda *a: "en-IN")
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    h = {"x-user-id": USER}
    cid = client.post("/api/consultations", json={}, headers=h).json()["consultationId"]
    first = client.post(f"/api/consultations/{cid}/messages", json={"content": "fever and headache"}, headers=h).json()
    assert json.loads(first["assistantMessage"]["content"])["questionnaire"]

    answers = {"items": [item("Since when has this been going on?", "1-3 days"), item("Do you have a fever?", "Yes", "yes_no", 2)],
               "note": "worse at night"}
    r = client.post(f"/api/consultations/{cid}/messages", json={"content": "My answers: ...", "answers": answers}, headers=h)
    assert r.status_code == 200, r.text
    user, bot = r.json()["userMessage"], json.loads(r.json()["assistantMessage"]["content"])
    assert user["answers"]["items"][1]["answer"] == "Yes" and user["answers"]["note"] == "worse at night"
    assert bot["triage"]["mode"] == "final"  # answered: the assessment follows, even if the LLM wants to ask again
    assert bot["triage"]["features"]["durationBand"] == "days" and bot["triage"]["features"]["fever"] == 1

    history = client.get(f"/api/consultations/{cid}/messages", headers=h).json()
    assert history[2]["answers"]["items"][0]["question"] == "Since when has this been going on?"

    for bad in ({"items": [{**item("q", "a"), "kind": "maybe"}]}, {"items": [item("q", "a" * 301)]}):
        assert client.post(f"/api/consultations/{cid}/messages", json={"content": "x", "answers": bad}, headers=h).status_code == 422


def test_guest_chat_carries_answers(monkeypatch):
    from app.core import config
    from app.schemas.guest import GuestMessage
    from app.services import guest_service

    severity_model.reset_for_tests(Forced("MODERATE", 0.4))
    monkeypatch.setattr(config, "GUEST_CHAT_ENABLED", True)
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    monkeypatch.setattr(triage_service, "get_provider", lambda: FakeProvider(QUESTIONS))
    monkeypatch.setattr(guest_service.language_service, "resolve_language", lambda text, lang, prev: prev or "en-IN")
    guest_service.per_minute.reset()
    guest_service.per_hour.reset()
    gid = "123e4567-e89b-42d3-a456-426614174000"
    first = guest_service.chat(gid, [GuestMessage(role="user", content="fever and cough")], "ip")
    assert json.loads(first["content"])["questionnaire"]
    turns = [GuestMessage(role="user", content="fever and cough"), GuestMessage(**first),
             GuestMessage(role="user", content="My answers: • How long: 1-3 days",
                          answers={"items": [item("Since when has this been going on?", "1-3 days")]})]
    reply = json.loads(guest_service.chat(gid, turns, "ip")["content"])
    assert reply["triage"]["mode"] == "final" and reply["triage"]["features"]["durationBand"] == "days"
