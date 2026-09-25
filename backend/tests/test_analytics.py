"""Analytics: privacy of events, correctness of aggregates, ranges, empty data."""

from __future__ import annotations

import hashlib
import json

import pytest

from app.core import config
from app.integrations.aws.dynamo_client import get_analytics_events_table
from app.repositories import analytics_repository as repo
from app.services import analytics_service as a
from app.services import consultation_service

from conftest import make_admin

FORBIDDEN = ("chest pain", "user-123", "@gmail.com", "Paracetamol", "diagnosis", "prompt")


def events() -> list[dict]:
    return get_analytics_events_table().scan()["Items"]


def rng(days=7, granularity="day"):
    today = a.local_now().date()
    return a.parse_range(str(today.fromordinal(today.toordinal() - days + 1)), str(today), granularity)


def test_metadata_is_allow_listed(aws):
    a.emit("AI_REQUEST", "user-123", input_type="text", content="I have chest pain", email="x@gmail.com",
           prompt="p", diagnosis="flu", medication="Paracetamol", response_time_ms="12", has_attachments=True)
    [event] = events()
    assert event["metadata"] == {"input_type": "text", "has_attachments": True}
    assert event["user_hash"] == hashlib.sha256(b"user-123test-salt").hexdigest()
    blob = json.dumps(event, default=str)
    assert not any(word in blob for word in FORBIDDEN)


def test_triage_events_carry_no_user(aws):
    a.emit("TRIAGE_COMPLETED", "user-123", severity="HIGH", source="ai")
    a.emit("EMERGENCY_CASE", "user-123", source="ai")
    assert all(e["user_hash"] is None for e in events())


def test_unknown_event_type_is_a_bug():
    with pytest.raises(ValueError):
        a.emit("PATIENT_SYMPTOMS", "u")


def test_post_message_records_real_flow_without_content(aws, monkeypatch):
    reply = json.dumps({"severity": "EMERGENCY", "riskScore": 95, "advice": "Call 108"})
    monkeypatch.setattr(consultation_service, "run_triage", lambda *args, **kw: (reply, False))
    monkeypatch.setattr(consultation_service.language_service, "resolve_language", lambda *args: "en-IN")
    monkeypatch.setattr(consultation_service.profile_repository, "get_profile", lambda uid: None)
    chat = consultation_service.create_consultation("user-123", None)
    consultation_service.post_message("user-123", chat["consultationId"], "I have chest pain", input_mode="voice")

    kinds = sorted(e["event_type"] for e in events())
    assert kinds == ["AI_REQUEST", "AI_RESPONSE", "CHAT_CREATED", "EMERGENCY_CASE", "TRIAGE_COMPLETED"]
    assert not any(word in json.dumps(events(), default=str) for word in FORBIDDEN)
    data = a.get_analytics(rng())
    assert data["ai"]["requests"]["value"] == 1
    assert data["ai"]["byInputType"]["voice"]["value"] == 1
    assert data["ai"]["byInputType"]["image"]["value"] is None  # never fabricated
    assert data["ai"]["avgLatencyMs"]["value"] is not None
    assert data["triage"]["bySeverity"]["EMERGENCY"]["value"] == 1
    assert data["triage"]["emergency"]["value"] == 1
    assert data["activity"]["conversationsStarted"]["value"] == 1
    assert data["activity"]["activeConversations"]["value"] == 1


def test_offline_fallback_counts_as_failed(aws):
    a.emit("AI_REQUEST", "u", input_type="text")
    a.emit("AI_RESPONSE_FAILED", "u", input_type="text", response_time_ms=40, status="failed")
    a.emit("AI_REQUEST", "u", input_type="text")
    a.emit("AI_RESPONSE", "u", input_type="text", response_time_ms=1000, status="success")
    a.emit("AI_REQUEST", "u", input_type="text")
    a.emit("AI_RESPONSE", "u", input_type="text", response_time_ms=2000, status="success")
    ai = a.get_analytics(rng())["ai"]
    assert (ai["requests"]["value"], ai["responses"]["value"], ai["failed"]["value"]) == (3, 2, 1)
    assert ai["successRate"]["value"] == 66.7
    assert ai["avgLatencyMs"]["value"] == 1500  # successful answers only
    assert ai["totalResponses"]["value"] == 2 and ai["responsesToday"]["value"] == 2


def test_feedback_counts_standing_votes(aws, monkeypatch):
    state = {"feedback": None, "at": None}

    def fake_set(user_id, cid, mid, feedback):
        previous = (state["feedback"], state["at"])
        state.update(feedback=feedback, at=a.local_now().isoformat() if feedback else None)
        return "ok", {"feedback": feedback}, previous

    monkeypatch.setattr(consultation_service.repo, "set_message_feedback", fake_set)
    for vote in ("like", "dislike", "like", None, "dislike"):
        consultation_service.set_message_feedback("u", "c", "m", vote)
    fb = a.get_analytics(rng())["feedback"]
    assert (fb["up"]["value"], fb["down"]["value"]) == (0, 1)
    assert fb["ratio"]["value"] == 0.0


def test_empty_data_is_unavailable_not_zero(aws):
    data = a.get_analytics(rng(), total_users=a.unavailable("x"))
    for section, key in [("ai", "requests"), ("ai", "avgLatencyMs"), ("feedback", "up"), ("triage", "total"),
                         ("activity", "documentsUploaded"), ("users", "newInRange"), ("users", "activeNow")]:
        assert data[section][key]["value"] is None and data[section][key]["unavailable"], (section, key)
    assert all(point["requests"] is None for point in data["ai"]["series"])
    assert data["kpis"]["apiErrors"]["value"] is None


def test_date_range_filters_counters(aws):
    today = a.local_now().date()
    days = [str(today.fromordinal(today.toordinal() - i)) for i in range(10)]
    for i, day in enumerate(days):
        repo.add_counter(repo.metric_pk("chats_created"), day, i + 1)
    repo.lower_since("chats_created", days[-1])
    last3 = a.parse_range(days[2], days[0])
    series = a.get_analytics(last3, ("activity",))["activity"]
    assert series["conversationsStarted"]["value"] == 1 + 2 + 3
    assert [p["conversations"] for p in series["series"]] == [3, 2, 1]
    whole = a.parse_range(days[-1], days[0])
    assert a.get_analytics(whole, ("activity",))["activity"]["conversationsStarted"]["value"] == sum(range(1, 11))


def test_series_before_tracking_is_null(aws):
    today = a.local_now().date()
    repo.add_counter(repo.metric_pk("chats_created"), str(today), 4)
    repo.lower_since("chats_created", str(today))
    series = a.get_analytics(rng(3), ("activity",))["activity"]["series"]
    assert [p["conversations"] for p in series] == [None, None, 4]


def test_distinct_users(aws):
    for user in ("u1", "u2", "u1", "u3"):
        a.touch_user(user)
    a.reset_caches()
    a.touch_user("u2")  # a new process seeing u2 again adds nothing
    users = a.get_analytics(rng(), ("users",))["users"]
    assert users["activeNow"]["value"] == 3
    assert users["dau"]["value"] == 3
    assert users["series"][-1]["active"] == 3
    stored = repo.batch_get([(repo.set_pk("active_users", s), str(a.local_now().date())) for s in range(4)])
    members = set().union(*(i["members"] for i in stored.values()))
    assert "u1" not in members and all(len(m) == 16 for m in members)


def test_no_salt_means_no_user_metrics(aws, monkeypatch):
    monkeypatch.setattr(config, "ANALYTICS_SALT", "")
    a.touch_user("u1")
    users = a.get_analytics(rng(), ("users",))["users"]
    assert users["dau"]["value"] is None and "ANALYTICS_SALT" in users["dau"]["unavailable"]


def test_registration_waits_for_backfill(aws):
    a.touch_user("new-user")
    assert a.get_analytics(rng(), ("users",))["users"]["newInRange"]["value"] is None
    repo.put_meta("BACKFILL", {"status": "done"})
    a.reset_caches()
    a.touch_user("new-user")
    a.reset_caches()
    a.touch_user("new-user")  # first-seen marker stops a second count
    assert a.get_analytics(rng(), ("users",))["users"]["newInRange"]["value"] == 1


def test_range_validation():
    with pytest.raises(a.RangeError):
        a.parse_range("2026-09-10", "2026-09-01")
    with pytest.raises(a.RangeError):
        a.parse_range("2024-01-01", "2026-01-01")
    with pytest.raises(a.RangeError):
        a.parse_range("2026-09-01", "2026-09-20", "hour")
    with pytest.raises(a.RangeError):
        a.parse_range("yesterday", None)


def test_hourly_granularity(aws):
    a.emit("AI_REQUEST", "u", input_type="text")
    data = a.get_analytics(rng(1, "hour"), ("ai",))
    assert len(data["range"]["labels"]) == 24
    assert sum(p["requests"] or 0 for p in data["ai"]["series"]) == 1


def test_endpoint_json_csv_and_validation(client, aws):
    admin = make_admin(aws, "boss@gmail.com")
    a.emit("CHAT_CREATED", "u")
    res = client.get("/api/admin/analytics", headers=admin["headers"])
    assert res.status_code == 200 and res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["kpis"]["totalUsers"]["value"] == 1  # Cognito estimate (moto)
    assert body["kpis"]["apiErrors"]["value"] is None  # API_GATEWAY_ID unset -> unavailable
    csv = client.get("/api/admin/analytics?format=csv", headers=admin["headers"])
    assert csv.status_code == 200 and csv.text.startswith("period,new_users")
    bad = client.get("/api/admin/analytics?from=2026-09-10&to=2026-09-01", headers=admin["headers"])
    assert bad.status_code == 422
    assert client.get("/api/admin/users", headers=admin["headers"]).json()["users"]["total"]["value"] == 1
    assert "feedback" in client.get("/api/admin/feedback", headers=admin["headers"]).json()


def test_storage_failure_never_raises(aws, monkeypatch):
    def boom(*_):
        raise RuntimeError("dynamodb down")

    monkeypatch.setattr(repo, "put_event", boom)
    a.emit("CHAT_CREATED", "u")  # swallowed and logged
    a.touch_user("u9")
