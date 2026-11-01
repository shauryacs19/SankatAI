"""Health timeline + per-chat doctor consultation report.

Both are read-only views over records that already exist: consultations
(chat-history table), Documents-vault files and their report analyses
(attachments table), symptom entries (chat-history ``SYMPTOM#`` rows) and the
health profile. Nothing is copied or stored again.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.repositories import consultation_repository, profile_repository
from app.services import report_analysis_service, symptom_service

logger = logging.getLogger("sankatai")

CATEGORIES = ("assessment", "report", "symptom", "medication")
MAX_EVENTS = 300
AI_LABEL = "AI-generated informational summary - not a confirmed diagnosis."


# --- timeline -----------------------------------------------------------------

def timeline(user_id: str, categories: Optional[set[str]] = None) -> list[dict]:
    want = categories or set(CATEGORIES)
    events: list[dict] = []
    if "assessment" in want:
        for c in consultation_repository.list_consultations(user_id):
            events.append({"id": f"c-{c['consultationId']}", "category": "assessment", "title": c["title"],
                           "at": c.get("createdAt"), "severity": c.get("lastSeverity"),
                           "details": {"consultationId": c["consultationId"], "updatedAt": c.get("updatedAt")}})
    if want & {"report", "medication"}:
        for r in report_analysis_service.list_reports(user_id):
            if "report" in want:
                events.append({"id": f"u-{r['attachmentId']}", "category": "report", "title": f"Uploaded {r['filename']}",
                               "at": r.get("uploadedAt"), "details": {"attachmentId": r["attachmentId"], "kind": "upload"}})
                if r["status"] == "ready":
                    events.append({"id": f"a-{r['attachmentId']}", "category": "report", "title": f"Report analysed: {r['filename']}",
                                   "at": r.get("analyzedAt"), "details": {
                                       "attachmentId": r["attachmentId"], "kind": "analysis", "summary": r.get("summary"),
                                       "abnormalCount": r.get("abnormalCount", 0), "reportType": r.get("reportType")}})
        if "medication" in want:
            for a in report_analysis_service.analyses(user_id, limit=50):
                meds = a["analysis"].get("medications") or []
                if meds:
                    events.append({"id": f"m-{a['attachmentId']}", "category": "medication",
                                   "title": f"Medicines listed in {a['filename']}", "at": a.get("analyzedAt"),
                                   "details": {"attachmentId": a["attachmentId"], "medications": meds}})
    if "symptom" in want:
        for e in symptom_service.list_entries(user_id):
            events.append({"id": f"s-{e['id']}", "category": "symptom", "title": f"{e['name']}: {e['severity']}/10",
                           "at": e["recordedAt"], "details": {"name": e["name"], "severity": e["severity"], "notes": e["notes"]}})
    events = [e for e in events if e.get("at")]
    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:MAX_EVENTS]


# --- doctor report: one chat, or the records picked on the timeline ---------------

class ConsultationNotFound(Exception):
    pass


class EmptySelection(Exception):
    pass


_DURATION = {"hours": "less than a day", "days": "1-3 days", "week": "4-14 days", "chronic": "more than 2 weeks"}
_ANSWER_PREFIX = "My answers:"
MAX_SELECTION = 300


def _age(dob: str) -> Optional[int]:
    try:
        born = date.fromisoformat(dob[:10])
    except (TypeError, ValueError):
        return None
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _clean(text, limit: int) -> str:
    return " ".join(str(text or "").split())[:limit]


def _stamp(iso: Optional[str]) -> str:
    return (iso or "")[:16].replace("T", " ")


def _chat_attachments(user_id: str, consultation_id: str) -> dict:
    from app.core import config
    from app.repositories.attachment_repository import DynamoAttachmentRepository
    try:
        items = [i for i in DynamoAttachmentRepository(config.ATTACHMENTS_TABLE).list_by_user(user_id)
                 if i.get("scope") == "chat" and i.get("chat_id") == consultation_id and i.get("status") == "uploaded"]
    except Exception:  # noqa: BLE001 - counts are optional
        return {"photos": 0, "documents": 0}
    photos = sum(1 for i in items if i.get("kind") == "photo" or str(i.get("content_type") or "").startswith("image/"))
    return {"photos": photos, "documents": len(items) - photos}


def _chat_section(user_id: str, chat: dict) -> dict:
    """What one consultation says: reported symptoms, answers, AI assessments."""
    cid = chat["consultationId"]
    reported: list[str] = []
    answers: list[dict] = []
    assessments: list[dict] = []
    duration = None
    for m in consultation_repository.list_messages(user_id, cid):
        if m["role"] == "user":
            items = (m.get("answers") or {}).get("items") if isinstance(m.get("answers"), dict) else None
            if items:
                answers += [{"question": _clean(i.get("question"), 200), "answer": _clean(i.get("answer"), 200)}
                            for i in items if isinstance(i, dict) and i.get("answer")]
                note = _clean((m.get("answers") or {}).get("note"), 400)
                if note:
                    reported.append(note)
            elif (m.get("content") or "").strip() and not m["content"].startswith(_ANSWER_PREFIX):
                reported.append(_clean(m["content"], 600))
            continue
        try:
            reply = json.loads(m.get("content") or "")
        except (TypeError, ValueError):
            continue
        if not isinstance(reply, dict):
            continue
        duration = _DURATION.get(((reply.get("triage") or {}).get("features") or {}).get("durationBand"), duration)
        if not reply.get("severity"):
            continue
        assessments.append({
            "date": _stamp(m.get("createdAt")), "severity": reply["severity"],
            "summary": _clean(reply.get("reasoning"), 500), "advice": _clean(reply.get("advice"), 600),
            "likelyCauses": [_clean(x, 80) for x in (reply.get("likelyCauses") or [])][:4],
            "warningSigns": [_clean(x, 100) for x in (reply.get("warningSigns") or [])][:5],
            "emergencyReasons": [_clean(x, 80) for x in ((reply.get("emergency") or {}).get("reasons") or [])],
        })
    return {"title": chat.get("title") or "Consultation", "startedAt": _stamp(chat.get("createdAt")),
            "updatedAt": _stamp(chat.get("updatedAt")), "reported": reported[-15:], "answers": answers[-20:],
            "duration": duration, "attachments": _chat_attachments(user_id, cid), "assessments": assessments[-5:]}


def _patient(user_id: str) -> dict:
    profile = profile_repository.get_profile(user_id) or {}
    meds = list(dict.fromkeys(m for r in report_analysis_service.analyses(user_id, limit=5)
                              for m in (r["analysis"].get("medications") or [])))
    name = " ".join(x for x in (profile.get("firstName"), profile.get("middleName"), profile.get("lastName")) if x)
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "patient": {"name": name or "Not provided", "age": _age(profile.get("dob") or ""),
                    "gender": profile.get("gender") or "", "bloodGroup": profile.get("bloodGroup") or ""},
        "history": {"conditions": profile.get("conditions") or "", "disability": profile.get("disability") or "",
                    "smoker": profile.get("smoker") or "", "heartHistory": profile.get("heartHistory") or ""},
        "allergies": profile.get("allergies") or "",
        "medications": meds,
    }


def chat_report_data(user_id: str, consultation_id: str) -> dict:
    """Report for ONE consultation (plus profile basics, allergies, medicines)."""
    chat = consultation_repository.get_consultation(user_id, consultation_id)
    if not chat:
        raise ConsultationNotFound("Chat not found.")
    section = _chat_section(user_id, chat)
    data = {**_patient(user_id), "scope": f"Consultation: {section['title']} (started {section['startedAt']} UTC)",
            "chats": [section], "symptoms": [], "reports": [], "uploads": []}
    data["questions"] = questions(data)
    return data


def selection_report_data(user_id: str, ids: list[str]) -> dict:
    """Report for the records picked on the timeline. Ids are timeline event ids;
    only ones found in THIS user's timeline count, so nothing else can leak in."""
    wanted = set(ids)
    events = [e for e in timeline(user_id) if e["id"] in wanted]
    if not events:
        raise EmptySelection("Select at least one record.")
    times = sorted(e["at"] for e in events)

    chats = []
    by_id = {c["consultationId"]: c for c in consultation_repository.list_consultations(user_id)}
    for e in sorted((e for e in events if e["category"] == "assessment"), key=lambda e: e["at"]):
        chat = by_id.get(e["details"]["consultationId"])
        if chat:
            chats.append(_chat_section(user_id, chat))

    entries = {e["id"][2:] for e in events if e["category"] == "symptom"}
    symptoms = []
    for s in symptom_service.grouped([x for x in symptom_service.list_entries(user_id) if x["id"] in entries]):
        symptoms.append({"name": s["name"], "trend": s["trend"],
                         "entries": [{"at": _stamp(x["recordedAt"]), "severity": x["severity"], "notes": x["notes"]} for x in s["entries"]]})

    report_ids = {e["details"]["attachmentId"] for e in events
                  if e["details"].get("kind") == "analysis" or e["category"] == "medication"}
    reports = [{"filename": r["filename"], "reportDate": r["analysis"].get("reportDate"), "summary": r["analysis"].get("summary"),
                "abnormal": [p for p in r["analysis"].get("parameters", []) if p["status"] in ("high", "low")],
                "medications": r["analysis"].get("medications") or []}
               for r in report_analysis_service.analyses(user_id, limit=50) if r["attachmentId"] in report_ids]
    uploads = [{"filename": e["title"].removeprefix("Uploaded "), "at": _stamp(e["at"])}
               for e in events if e["details"].get("kind") == "upload" and e["details"]["attachmentId"] not in report_ids]

    data = {**_patient(user_id), "scope": f"{len(events)} selected record(s) from {times[0][:10]} to {times[-1][:10]}",
            "chats": chats, "symptoms": symptoms, "reports": reports, "uploads": uploads}
    data["questions"] = questions(data)
    return data


def questions(data: dict) -> list[str]:
    """Questions for the doctor, built only from the records in the report (never the LLM)."""
    q: list[str] = []
    many = len(data["chats"]) > 1
    for c in data["chats"]:
        about = f"About \"{c['title']}\": " if many else ""
        last = c["assessments"][-1] if c["assessments"] else None
        if last and last["severity"] in ("HIGH", "EMERGENCY"):
            q.append(f"{about}The AI check rated this as {last['severity'].lower()}. How urgent is it, and do I need tests?")
        if c["duration"]:
            q.append(f"{about}I have had this for {c['duration']}. Is that expected for this problem?")
        for cause in (last or {}).get("likelyCauses", [])[:2 if many else 3]:
            q.append(f"{about}The AI mentioned \"{cause}\" as a possible cause. Is that likely in my case, and how can it be confirmed or ruled out?")
        if last and last["warningSigns"] and not many:
            q.append(f"Which of these signs should make me come back straight away: {', '.join(last['warningSigns'][:4])}?")
    for s in data["symptoms"]:
        t = s["trend"]
        if t["direction"] == "increasing":
            q.append(f"My {s['name']} ratings went up from {t['first']}/10 to {t['latest']}/10. What could be causing this?")
        elif t["latest"] is not None and t["latest"] >= 7:
            q.append(f"My {s['name']} is still rated {t['latest']}/10. Does it need tests or a change in treatment?")
    for r in data["reports"]:
        for p in r["abnormal"][:3]:
            q.append(f"My {p['name']} was {p['status']} ({p['value']} {p['unit']}, printed range {p['referenceRange']}) in {r['filename']}. What does this mean, and does it need a repeat test?")
    if data["medications"]:
        q.append("Are my current medicines safe to continue, and do any of them interact?")
    if data["allergies"]:
        q.append("Should any treatment be avoided because of my allergies?")
    q.append("What should I do if things do not improve, and when should I follow up?")
    return list(dict.fromkeys(q))[:14]


# --- PDF ------------------------------------------------------------------------

_LATIN = str.maketrans({"–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "•": "-", "…": "...",
                        "≤": "<=", "≥": ">=", "µ": "u", "μ": "u", "°": " deg ", " ": " "})


def _t(text) -> str:
    """Core PDF fonts are Latin-1 only; other scripts become '?'."""
    return str(text if text is not None else "").translate(_LATIN).encode("latin-1", "replace").decode("latin-1")


def render_pdf(data: dict) -> bytes:
    from fpdf import FPDF

    class Doc(FPDF):
        def footer(self):
            self.set_y(-14)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(110)
            self.cell(0, 5, _t(f"SankatAI doctor report - {AI_LABEL} - page {self.page_no()}"), align="C")

    pdf = Doc(format="A4")
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    def line(text, size=10, style="", color=0, h=5.2):
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(color)
        pdf.multi_cell(0, h, _t(text), new_x="LMARGIN", new_y="NEXT")

    def heading(text, ai=False):
        pdf.ln(3)
        line(text, 12, "B", 20, 6.5)
        if ai:
            line(AI_LABEL, 8, "I", 120, 4.2)
        pdf.set_draw_color(210)
        pdf.line(16, pdf.get_y() + 0.8, 194, pdf.get_y() + 0.8)
        pdf.ln(2)

    def bullet(text):
        line(f"-  {text}")

    line("Doctor consultation report", 18, "B", 10, 9)
    line(data["scope"], 10, "B", 40)
    line(f"Prepared by the patient with SankatAI on {data['generatedAt']}. It covers only the records listed here. "
         "It is not a diagnosis and has not been reviewed by a clinician.", 9, "I", 90)

    p = data["patient"]
    heading("Patient information")
    bullet(f"Name: {p['name']}")
    bullet(f"Age: {p['age'] if p['age'] is not None else 'Not provided'}    Sex: {p['gender'] or 'Not provided'}    "
           f"Blood group: {p['bloodGroup'] or 'Not provided'}")

    h = data["history"]
    heading("Medical history")
    bullet(f"Known conditions: {h['conditions'] or 'None recorded'}")
    if h["disability"]:
        bullet(f"Disability: {h['disability']}")
    bullet(f"Smoker: {h['smoker'] or 'Not recorded'}    Heart history: {h['heartHistory'] or 'Not recorded'}")

    heading("Allergies and medications")
    bullet(f"Allergies: {data['allergies'] or 'None recorded'}")
    if data["medications"]:
        bullet("Medicines listed in uploaded documents (AI-read, please confirm):")
        for m in data["medications"]:
            line(f"      {m}")
    else:
        bullet("Medications: none recorded")

    for c in data["chats"]:
        heading(f"Consultation: {c['title']}" if len(data["chats"]) > 1 else "Symptoms reported in this consultation")
        if len(data["chats"]) > 1:
            line(f"Started {c['startedAt']} UTC", 9, "", 90)
        if c["duration"]:
            bullet(f"Duration mentioned: {c['duration']}")
        if not c["reported"] and not c["answers"]:
            line("No symptoms were described in this chat.", color=90)
        for r in c["reported"]:
            bullet(r)
        if c["answers"]:
            line("Answers to follow-up questions:", 10, "B")
            for a in c["answers"]:
                bullet(f"{a['question']} - {a['answer']}")
        att = c["attachments"]
        if att["photos"] or att["documents"]:
            bullet(f"Shared in the chat: {att['photos']} photo(s), {att['documents']} document(s).")
        line("AI triage assessment", 10, "B")
        line(AI_LABEL, 8, "I", 120, 4.2)
        if not c["assessments"]:
            line("This chat has no AI assessment yet.", color=90)
        for a in c["assessments"]:
            line(f"{a['date']} UTC - rated {a['severity'].lower()}", 10, "B")
            if a["emergencyReasons"]:
                line(f"Emergency warning signs detected: {', '.join(a['emergencyReasons'])}", 10, "B", 150)
            if a["summary"]:
                line(a["summary"])
            if a["likelyCauses"]:
                line(f"Possible causes mentioned (not confirmed): {', '.join(a['likelyCauses'])}", 9, "", 70)
            if a["advice"]:
                line(f"Advice given: {a['advice']}", 9, "", 70)
            if a["warningSigns"]:
                line(f"Warning signs listed: {', '.join(a['warningSigns'])}", 9, "", 70)
            pdf.ln(1.5)

    if data["symptoms"]:
        heading("Symptom log")
        for s in data["symptoms"]:
            t = s["trend"]
            line(f"{s['name']} - {t['count']} entr{'y' if t['count'] == 1 else 'ies'}, recorded trend: {t['direction']}", 10, "B")
            for x in s["entries"]:
                bullet(f"{x['at']} UTC: {x['severity']}/10" + (f" - {x['notes']}" if x["notes"] else ""))

    if data["reports"]:
        heading("Medical report findings", ai=True)
        for r in data["reports"]:
            line(f"{r['filename']} ({r['reportDate'] or 'date not stated'})", 10, "B")
            if r["summary"]:
                line(r["summary"])
            for x in r["abnormal"]:
                bullet(f"{x['name']}: {x['value']} {x['unit']} - {x['status'].upper()} (printed range {x['referenceRange']})")
            if not r["abnormal"]:
                line("No values outside the printed reference ranges were found.", 9, "", 70)
            pdf.ln(1.5)

    if data["uploads"]:
        heading("Other documents uploaded")
        for u in data["uploads"]:
            bullet(f"{u['filename']} ({u['at']} UTC) - not analysed")

    heading("Questions to discuss with the doctor")
    for i, q in enumerate(data["questions"], 1):
        line(f"{i}. {q}")

    return bytes(pdf.output())
