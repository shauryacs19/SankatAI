"""Symptom tracker, report analyzer, health timeline and doctor report (moto-backed)."""

from __future__ import annotations

import io
import json

import boto3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import config
from app.services import report_analysis_service as reports
from app.services import symptom_service

ALICE = {"x-user-id": "alice"}
BOB = {"x-user-id": "bob"}

LAB_TEXT = [
    "City Diagnostics - Complete Blood Count",
    "Report date: 2026-10-28",
    "Haemoglobin 10.2 g/dL 13.0 - 17.0",
    "WBC Count 7.5 10^3/uL 4.0 - 11.0",
    "Platelets 480 10^3/uL 150 - 450",
    "Vitamin D 18 ng/mL",
]


def _pdf(lines: list[str]) -> bytes:
    from fpdf import FPDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for text in lines:
        pdf.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


class _Now:
    """Runs background work inline so tests see the finished analysis."""

    def submit(self, fn, *args):
        fn(*args)


@pytest.fixture
def api(aws, monkeypatch):
    from app.api.routes.health_records import router
    from app.api.routes.consultations import router as consultations_router

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(reports, "_executor", _Now())
    reports.analyze_limiter.reset()
    symptom_service.summary_limiter.reset()
    boto3.client("s3", region_name="ap-south-1").create_bucket(
        Bucket=config.DOCUMENTS_BUCKET, CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
    app = FastAPI()
    app.include_router(router)
    app.include_router(consultations_router)
    return TestClient(app)


def _upload(user: str, att_id: str, data: bytes, *, filename="cbc.pdf", ctype="application/pdf", **extra):
    key = f"documents/{user}/{att_id}"
    boto3.client("s3", region_name="ap-south-1").put_object(Bucket=config.DOCUMENTS_BUCKET, Key=key, Body=data)
    boto3.resource("dynamodb", region_name="ap-south-1").Table(config.ATTACHMENTS_TABLE).put_item(Item={
        "user_id": user, "attachment_id": att_id, "scope": "vault", "status": "uploaded", "kind": "document",
        "bucket": config.DOCUMENTS_BUCKET, "key": key, "filename": filename, "content_type": ctype,
        "created_at": "2026-10-30T10:00:00.000Z", **extra})


# --- symptoms ----------------------------------------------------------------

def test_symptom_entries_trend_and_isolation(api):
    for sev, day in ((3, 28), (4, 29), (6, 30), (7, 31)):
        r = api.post("/api/symptoms", headers=ALICE,
                     json={"name": "Headache", "severity": sev, "recordedAt": f"2026-10-{day}T09:00:00Z", "notes": "evening"})
        assert r.status_code == 201
    api.post("/api/symptoms", headers=ALICE, json={"name": "cough", "severity": 5})
    data = api.get("/api/symptoms", headers=ALICE).json()
    assert len(data["entries"]) == 5
    head = next(s for s in data["symptoms"] if s["name"].lower() == "headache")
    assert head["trend"]["direction"] == "increasing" and head["trend"]["latest"] == 7
    assert [e["severity"] for e in head["entries"]] == [3, 4, 6, 7]  # oldest first

    assert api.get("/api/symptoms", headers=BOB).json()["entries"] == []
    entry = data["entries"][0]["id"]
    assert api.delete(f"/api/symptoms/{entry}", headers=BOB).status_code == 404  # not Bob's
    assert api.delete(f"/api/symptoms/{entry}", headers=ALICE).status_code == 204
    assert len(api.get("/api/symptoms", headers=ALICE).json()["entries"]) == 4


def test_symptom_rows_do_not_leak_into_consultations(api):
    api.post("/api/symptoms", headers=ALICE, json={"name": "fever", "severity": 4})
    assert api.get("/api/consultations", headers=ALICE).json() == []


@pytest.mark.parametrize("body", [
    {"name": "", "severity": 3}, {"name": "x", "severity": 0}, {"name": "x", "severity": 11},
    {"name": "x", "severity": 5, "recordedAt": "2999-01-01T00:00:00Z"}, {"name": "x" * 61, "severity": 5},
    {"name": "x", "severity": 5, "extra": 1}, {"name": "x", "severity": 5, "notes": "n" * 501},
])
def test_symptom_validation(api, body):
    assert api.post("/api/symptoms", headers=ALICE, json=body).status_code == 422


@pytest.mark.parametrize("values,direction", [([5, 5, 6, 5], "stable"), ([8, 7, 4, 3], "decreasing"), ([4], "insufficient")])
def test_trend_directions(values, direction):
    entries = [{"severity": v, "recordedAt": f"2026-10-0{i + 1}"} for i, v in enumerate(values)]
    assert symptom_service.trend_of(entries)["direction"] == direction


def test_summary_without_ai_describes_numbers_only(api):
    for sev in (6, 4):
        api.post("/api/symptoms", headers=ALICE, json={"name": "back pain", "severity": sev})
    r = api.post("/api/symptoms/summary", headers=ALICE, json={"name": "Back pain"}).json()
    assert r["source"] == "rules" and "gone down" in r["summary"]
    assert "does not confirm" in r["disclaimer"]
    assert api.post("/api/symptoms/summary", headers=BOB, json={"name": "back pain"}).status_code == 404


# --- report analyzer ---------------------------------------------------------

def test_range_parsing_and_flags():
    assert reports.parse_range("13.0 - 17.0") == (13.0, 17.0)
    assert reports.parse_range("< 200") == (None, 200.0)
    assert reports.parse_range(">= 40") == (40.0, None)
    assert reports.parse_range("Negative") == (None, None)
    assert reports.flag(10.2, 13.0, 17.0) == "low"
    assert reports.flag(480, 150, 450) == "high"
    assert reports.flag(7.5, 4.0, 11.0) == "normal"
    assert reports.flag(18, None, None) == "not_assessed"


def test_offline_pdf_analysis_flags_only_printed_ranges(api):
    _upload("alice", "doc1", _pdf(LAB_TEXT))
    r = api.post("/api/reports/doc1/analyze", headers=ALICE)
    assert r.status_code == 200
    got = api.get("/api/reports/doc1", headers=ALICE).json()
    assert got["status"] == "ready" and got["analysis"]["source"] == "rules"
    by = {p["name"]: p for p in got["analysis"]["parameters"]}
    assert by["Haemoglobin"]["status"] == "low" and by["Platelets"]["status"] == "high"
    assert by["WBC Count"]["status"] == "normal"
    assert "Vitamin D" not in by  # no printed range: the offline reader does not guess
    assert got["abnormalCount"] == 2 and "not a diagnosis" in got["disclaimer"]
    assert got["analysis"]["reportDate"] == "2026-10-28"


def test_ai_ranges_not_in_the_document_are_dropped(api, monkeypatch):
    from app.integrations.ai import openai_provider
    from app.services import triage_service

    class Fake:
        def generate(self, messages, **kw):
            return json.dumps({"isMedical": True, "reportType": "CBC", "summary": "Blood count.", "parameters": [
                {"name": "Haemoglobin", "value": "10.2", "unit": "g/dL", "referenceRange": "13.0 - 17.0", "explanation": "Carries oxygen."},
                {"name": "Vitamin D", "value": "18", "unit": "ng/mL", "referenceRange": "30 - 100", "explanation": "Bone health."},  # invented range
                {"name": "Ferritin", "value": "5", "unit": "ng/mL", "referenceRange": "", "explanation": ""},  # invented value
            ], "medications": []})

    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    monkeypatch.setattr(openai_provider, "get_provider", lambda: Fake())
    _upload("alice", "doc2", _pdf(LAB_TEXT))
    api.post("/api/reports/doc2/analyze", headers=ALICE)
    a = api.get("/api/reports/doc2", headers=ALICE).json()["analysis"]
    by = {p["name"]: p for p in a["parameters"]}
    assert a["source"] == "ai" and by["Haemoglobin"]["status"] == "low"
    assert by["Vitamin D"]["referenceRange"] is None and by["Vitamin D"]["status"] == "not_assessed"
    assert "Ferritin" not in by


def test_report_isolation_and_protection(api):
    _upload("alice", "doc3", _pdf(LAB_TEXT))
    _upload("alice", "locked", _pdf(LAB_TEXT), password_protected=True)
    assert api.get("/api/reports/doc3", headers=BOB).status_code == 404
    assert api.post("/api/reports/doc3/analyze", headers=BOB).status_code == 404
    assert api.get("/api/reports", headers=BOB).json()["reports"] == []
    assert api.post("/api/reports/locked/analyze", headers=ALICE).status_code == 400


def test_unreadable_documents_fail_with_a_reason(api):
    _upload("alice", "img", b"\x89PNG not really", filename="scan.png", ctype="image/png")
    api.post("/api/reports/img/analyze", headers=ALICE)
    got = api.get("/api/reports/img", headers=ALICE).json()
    assert got["status"] == "failed" and "AI service" in got["error"]
    _upload("alice", "blank", _pdf([]))
    api.post("/api/reports/blank/analyze", headers=ALICE)
    assert "no readable text" in api.get("/api/reports/blank", headers=ALICE).json()["error"]


# --- timeline + doctor report --------------------------------------------------

def test_timeline(api):
    _upload("alice", "doc4", _pdf(LAB_TEXT))
    api.post("/api/reports/doc4/analyze", headers=ALICE)
    api.post("/api/symptoms", headers=ALICE, json={"name": "Headache", "severity": 6})
    api.post("/api/consultations", headers=ALICE, json={})

    events = api.get("/api/timeline", headers=ALICE).json()["events"]
    assert {"assessment", "report", "symptom"} <= {e["category"] for e in events}
    assert events == sorted(events, key=lambda e: e["at"], reverse=True)
    only = api.get("/api/timeline?category=symptom", headers=ALICE).json()["events"]
    assert only and all(e["category"] == "symptom" for e in only)
    assert api.get("/api/timeline?category=bogus", headers=ALICE).status_code == 422
    assert api.get("/api/timeline", headers=BOB).json()["events"] == []


def test_doctor_report_covers_one_chat_only(api):
    from app.repositories import consultation_repository as repo

    chat = api.post("/api/consultations", headers=ALICE, json={}).json()["consultationId"]
    other = api.post("/api/consultations", headers=ALICE, json={}).json()["consultationId"]
    repo.add_message("alice", chat, "user", "Sharp pain in my lower right belly since yesterday")
    repo.add_message("alice", chat, "user", "My answers: Fever - Yes", answers={"items": [
        {"id": "q1", "question": "Do you have a fever?", "answer": "Yes", "kind": "yes_no"}], "note": ""})
    repo.add_message("alice", chat, "assistant", json.dumps({
        "severity": "HIGH", "reasoning": "Pain in the lower right abdomen with fever.", "advice": "See a doctor today.",
        "likelyCauses": ["Appendicitis"], "warningSigns": ["Worsening pain", "Vomiting"],
        "triage": {"features": {"durationBand": "days"}}}), severity="HIGH")
    repo.add_message("alice", other, "user", "Itchy rash on my arm")

    data = api.get(f"/api/consultations/{chat}/doctor-report", headers=ALICE).json()
    c = data["chats"][0]
    assert len(data["chats"]) == 1 and data["symptoms"] == [] and data["reports"] == []
    assert c["reported"] == ["Sharp pain in my lower right belly since yesterday"]
    assert c["answers"] == [{"question": "Do you have a fever?", "answer": "Yes"}]
    assert c["duration"] == "1-3 days" and c["assessments"][0]["severity"] == "HIGH"
    assert any("Appendicitis" in q for q in data["questions"]) and any("urgent" in q for q in data["questions"])
    assert "rash" not in json.dumps(data)  # the other chat never leaks in

    pdf = api.get(f"/api/consultations/{chat}/doctor-report/pdf", headers=ALICE)
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF") and "no-store" in pdf.headers["cache-control"]
    from pypdf import PdfReader
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
    assert "Doctor consultation report" in text and "not a confirmed diagnosis" in text and "Appendicitis" in text

    assert api.get(f"/api/consultations/{chat}/doctor-report", headers=BOB).status_code == 404
    assert api.get(f"/api/consultations/{chat}/doctor-report/pdf", headers=BOB).status_code == 404
    assert api.get("/api/consultations/nope/doctor-report", headers=ALICE).status_code == 404


def test_doctor_report_from_selected_timeline_records(api):
    from app.repositories import consultation_repository as repo

    _upload("alice", "doc5", _pdf(LAB_TEXT))
    api.post("/api/reports/doc5/analyze", headers=ALICE)
    kept = api.post("/api/symptoms", headers=ALICE, json={"name": "Headache", "severity": 4, "recordedAt": "2026-10-20T08:00:00Z"}).json()["id"]
    api.post("/api/symptoms", headers=ALICE, json={"name": "Headache", "severity": 8, "recordedAt": "2026-10-21T08:00:00Z", "notes": "left out"})
    chat = api.post("/api/consultations", headers=ALICE, json={}).json()["consultationId"]
    repo.add_message("alice", chat, "user", "Dizzy when I stand up")
    skipped = api.post("/api/consultations", headers=ALICE, json={}).json()["consultationId"]
    repo.add_message("alice", skipped, "user", "Itchy rash on my arm")

    ids = [f"s-{kept}", f"c-{chat}", "a-doc5"]
    pdf = api.post("/api/doctor-report/selection", headers=ALICE, json={"ids": ids})
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf" and "no-store" in pdf.headers["cache-control"]
    from pypdf import PdfReader
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
    assert "3 selected record(s)" in text and "Dizzy when I stand up" in text and "Haemoglobin" in text and "4/10" in text
    assert "rash" not in text and "left out" not in text  # unselected records stay out

    from app.services import health_record_service as svc
    data = svc.selection_report_data("alice", ids)
    assert [s["name"] for s in data["symptoms"]] == ["Headache"] and data["symptoms"][0]["trend"]["count"] == 1
    assert len(data["chats"]) == 1 and data["reports"][0]["abnormal"]

    # Another user's ids are ignored, so nothing of Alice's can be pulled in.
    assert api.post("/api/doctor-report/selection", headers=BOB, json={"ids": ids}).status_code == 400
    assert api.post("/api/doctor-report/selection", headers=ALICE, json={"ids": []}).status_code == 422
    assert api.post("/api/doctor-report/selection", headers=ALICE, json={"ids": ["x-../../etc"]}).status_code == 422


# --- extra paths: AI photos, fallbacks, limits, stale jobs, medicines ------------

def _png(lines=("TSH 6.8 uIU/mL 0.4 - 4.0",)) -> bytes:
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (400, 120), "white")
    draw = ImageDraw.Draw(img)
    for i, text in enumerate(lines):
        draw.text((10, 10 + i * 20), text, fill="black")
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


@pytest.fixture
def ai(monkeypatch):
    """AI 'configured' with a scripted provider: set .image / .text to a dict or an Exception."""
    from app.integrations.ai import openai_provider
    from app.services import triage_service

    class Fake:
        image = None
        text = None

        def _out(self, v):
            if isinstance(v, Exception):
                raise v
            return json.dumps(v)

        def analyze_image(self, b64, mime, **kw):
            return self._out(self.image)

        def generate(self, messages, **kw):
            return self._out(self.text)

    fake = Fake()
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    monkeypatch.setattr(openai_provider, "get_provider", lambda: fake)
    return fake


def _analyse(api, att):
    api.post(f"/api/reports/{att}/analyze", headers=ALICE)
    return api.get(f"/api/reports/{att}", headers=ALICE).json()


def test_photo_report_read_by_ai_feeds_medicines_into_timeline_and_reports(api, ai):
    ai.image = {"isMedical": True, "reportType": "Thyroid", "summary": "Thyroid panel.", "medications": ["Thyronorm 25 mcg"],
                "parameters": [{"name": "TSH", "value": "6.8", "unit": "uIU/mL", "referenceRange": "0.4 - 4.0", "explanation": "Thyroid signal."},
                               "junk", {"name": "", "value": "1"}]}
    _upload("alice", "thy", _png(), filename="thyroid.png", ctype="image/png", kind="photo")
    got = _analyse(api, "thy")
    a = got["analysis"]
    assert got["status"] == "ready"
    assert a["source"] == "ai"
    assert a["verifiedAgainstText"] is False
    assert [p["status"] for p in a["parameters"]] == ["high"]
    assert a["medications"] == ["Thyronorm 25 mcg"]
    meds = api.get("/api/timeline?category=medication", headers=ALICE).json()["events"]
    assert meds[0]["details"]["medications"] == ["Thyronorm 25 mcg"]

    pdf = api.post("/api/doctor-report/selection", headers=ALICE, json={"ids": [meds[0]["id"], "u-thy"]})
    from pypdf import PdfReader
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
    assert "TSH" in text
    assert "Thyronorm" in text


@pytest.mark.parametrize("image,data,error", [
    (RuntimeError("down"), None, "couldn't read this photo"),
    ({"isMedical": False}, None, "doesn't look like a medical report"),
    ({"isMedical": True, "parameters": []}, None, "No test results could be read"),
    ({"isMedical": True}, b"not an image", "could not be opened"),
])
def test_photo_report_failures_explain_why(api, ai, image, data, error):
    ai.image = image
    _upload("alice", "p1", data or _png(), filename="scan.png", ctype="image/png", kind="photo")
    got = _analyse(api, "p1")
    assert got["status"] == "failed"
    assert error in got["error"]


def test_text_reports_and_ai_fallback(api, ai):
    ai.text = RuntimeError("timeout")  # AI fails -> the regex reader still works
    _upload("alice", "t1", "\n".join(LAB_TEXT).encode(), filename="cbc.txt", ctype="text/plain")
    got = _analyse(api, "t1")
    assert got["status"] == "ready"
    assert got["analysis"]["source"] == "rules"
    assert got["abnormalCount"] == 2

    _upload("alice", "d1", b"PK\x03\x04", filename="notes.docx", ctype="application/vnd.openxmlformats")
    assert "Only PDF, text and image" in _analyse(api, "d1")["error"]


def test_unexpected_failure_and_stale_jobs(api, monkeypatch):
    def boom(item):
        raise RuntimeError("bug")
    monkeypatch.setattr(reports, "_analyse", boom)
    _upload("alice", "x1", _pdf(LAB_TEXT))
    assert _analyse(api, "x1")["error"] == "The report could not be analysed. Try again."

    _upload("alice", "x2", _pdf(LAB_TEXT), report_status="processing", report_started_at="2020-01-01T00:00:00Z")
    stale = api.get("/api/reports/x2", headers=ALICE).json()
    assert stale["status"] == "failed"
    assert "interrupted" in stale["error"]
    _upload("alice", "x3", _pdf(LAB_TEXT), report_status="processing", report_started_at="not a date")
    assert api.get("/api/reports/x3", headers=ALICE).json()["status"] == "failed"

    from app.integrations.aws.dynamo_client import now_iso
    _upload("alice", "x4", _pdf(LAB_TEXT), report_status="processing", report_started_at=now_iso())
    assert api.post("/api/reports/x4/analyze", headers=ALICE).json()["status"] == "processing"  # no second job

    _upload("alice", "x5", _pdf(LAB_TEXT), report_status="ready", report_analysis="{broken json")
    assert "analysis" not in api.get("/api/reports/x5", headers=ALICE).json()


def test_analysis_rate_limit(api, monkeypatch):
    monkeypatch.setattr(reports.analyze_limiter, "allow", lambda key: False)
    _upload("alice", "r1", _pdf(LAB_TEXT))
    assert api.post("/api/reports/r1/analyze", headers=ALICE).status_code == 429


def test_ai_symptom_summary_and_its_fallbacks(api, ai, monkeypatch):
    for sev in (3, 6):
        api.post("/api/symptoms", headers=ALICE, json={"name": "Knee pain", "severity": sev, "notes": "after running"})
    ai.text = {"summary": "Your knee pain ratings went from 3 to 6."}
    r = api.post("/api/symptoms/summary", headers=ALICE, json={"name": "knee pain"}).json()
    assert r["source"] == "ai"
    assert "3 to 6" in r["summary"]

    ai.text = RuntimeError("down")
    assert api.post("/api/symptoms/summary", headers=ALICE, json={"name": "knee pain"}).json()["source"] == "rules"

    monkeypatch.setattr(symptom_service.summary_limiter, "allow", lambda key: False)
    assert api.post("/api/symptoms/summary", headers=ALICE, json={"name": "knee pain"}).status_code == 429


@pytest.mark.parametrize("body", [
    {"name": "   ", "severity": 3},
    {"name": "x", "severity": 5, "recordedAt": "1990-01-01T00:00:00Z"},
])
def test_more_symptom_validation(api, body):
    assert api.post("/api/symptoms", headers=ALICE, json=body).status_code == 422


def test_naive_times_are_treated_as_utc(api):
    r = api.post("/api/symptoms", headers=ALICE, json={"name": "Nausea", "severity": 2, "recordedAt": "2026-10-20T08:00:00"}).json()
    assert r["recordedAt"].startswith("2026-10-20T08:00")


def test_chat_report_counts_shared_photos_and_emergency_signs(api):
    from app.repositories import consultation_repository as repo

    chat = api.post("/api/consultations", headers=ALICE, json={}).json()["consultationId"]
    repo.add_message("alice", chat, "user", "He collapsed and is not responding")
    repo.add_message("alice", chat, "user", "My answers: x", answers={"items": [], "note": "It happened after lunch"})
    repo.add_message("alice", chat, "user", "My answers: y",
                     answers={"items": [{"question": "Breathing?", "answer": "Yes"}], "note": "Lips look blue"})
    repo.add_message("alice", chat, "assistant", json.dumps({"severity": "EMERGENCY", "reasoning": "Unresponsive.",
                                                             "emergency": {"reasons": ["unconscious or unresponsive"]}}),
                     severity="EMERGENCY")
    repo.add_message("alice", chat, "assistant", "plain text, not json")
    boto3.resource("dynamodb", region_name="ap-south-1").Table(config.ATTACHMENTS_TABLE).put_item(Item={
        "user_id": "alice", "attachment_id": "ph1", "scope": "chat", "chat_id": chat, "status": "uploaded", "kind": "photo"})
    c = api.get(f"/api/consultations/{chat}/doctor-report", headers=ALICE).json()["chats"][0]
    assert c["attachments"] == {"photos": 1, "documents": 0}
    assert c["assessments"][0]["emergencyReasons"] == ["unconscious or unresponsive"]
    assert "Lips look blue" in c["reported"]
    assert {"question": "Breathing?", "answer": "Yes"} in c["answers"]
    pdf = api.get(f"/api/consultations/{chat}/doctor-report/pdf", headers=ALICE)
    from pypdf import PdfReader
    assert "Emergency warning signs detected" in "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
