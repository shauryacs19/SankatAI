"""Consultation business logic.

Orchestrates chat history persistence + triage: records the user's message,
builds the last-8-turn context, runs triage, parses severity/risk, stores the
assistant reply, and maintains the consultation title/last-severity. Depends on
repositories + the triage service, never on boto3 or the AI SDK directly.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from app.repositories import consultation_repository as repo
from app.repositories import profile_repository
from app.schemas.triage import Message as ChatMessage
from app.schemas.triage import PatientProfile
from app.services.triage_service import run_triage


# --- helpers ---------------------------------------------------------------

def _age_from_dob(dob: str) -> str:
    """Return age in years as a string, or '' if dob is missing/invalid."""
    if not dob:
        return ""
    try:
        born = datetime.fromisoformat(dob).date()
    except ValueError:
        try:
            born = datetime.strptime(dob, "%Y-%m-%d").date()
        except ValueError:
            return ""
    today = date.today()
    years = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    return str(max(0, years))


def _patient_profile_from_profile(profile: dict | None) -> Optional[PatientProfile]:
    if not profile:
        return None
    return PatientProfile(
        age=_age_from_dob(profile.get("dob", "")),
        gender=profile.get("gender"),
        bloodGroup=profile.get("bloodGroup"),
        conditions=profile.get("conditions"),
        allergies=profile.get("allergies"),
        medications=None,
    )


def _title_from_text(text: str) -> str:
    snippet = " ".join(text.strip().split())
    return (snippet[:47] + "…") if len(snippet) > 48 else (snippet or "New consultation")


# --- use cases -------------------------------------------------------------

def search_consultations(user_id: str, query: str) -> list[dict]:
    """Consultations matching a query in the title OR in any message body."""
    return repo.search_consultations(user_id, query)


def soft_delete_message(user_id: str, consultation_id: str, message_id: str) -> str:
    """Unsend: flag the message deleted; the row is kept for the audit trail."""
    return repo.soft_delete_message(user_id, consultation_id, message_id)


def list_consultations(user_id: str) -> list[dict]:
    return repo.list_consultations(user_id)


def create_consultation(user_id: str, title: Optional[str]) -> dict:
    return repo.create_consultation(user_id, title or "New consultation")


def consultation_exists(user_id: str, consultation_id: str) -> bool:
    return repo.get_consultation(user_id, consultation_id) is not None


def list_messages(user_id: str, consultation_id: str) -> list[dict]:
    return repo.list_messages(user_id, consultation_id)


def delete_consultation(user_id: str, consultation_id: str) -> bool:
    return repo.delete_consultation(user_id, consultation_id)


def rename_consultation(user_id: str, consultation_id: str, title: str) -> Optional[dict]:
    return repo.rename_consultation(user_id, consultation_id, title.strip())


def set_message_feedback(
    user_id: str, consultation_id: str, message_id: str, feedback: Optional[str]
) -> tuple[str, Optional[dict]]:
    """Record like/dislike on an AI message. Ownership is enforced by scoping to
    the caller's user_id partition in the repository."""
    return repo.set_message_feedback(user_id, consultation_id, message_id, feedback)


def post_message(user_id: str, consultation_id: str, content: str,
                 attachment_ids: Optional[list] = None) -> Optional[dict]:
    """Persist the user's message (optionally with attachments). If the message
    has text, run triage and store the reply; an attachment-only message is just
    recorded (no AI turn). Returns ``{userMessage, assistantMessage,
    isOfflineFallback}`` or None when there's nothing to send.
    """
    text = (content or "").strip()
    attachment_ids = list(attachment_ids or [])
    if not text and not attachment_ids:
        return None

    # Persist the user's message (with any attachment references).
    user_msg = repo.add_message(user_id, consultation_id, "user", content, attachment_ids=attachment_ids)

    # Attachment-only message: record it, no AI turn.
    if not text:
        history_items = repo.list_messages(user_id, consultation_id)
        is_first_user_msg = sum(1 for m in history_items if m["role"] == "user") == 1
        if is_first_user_msg:
            repo.touch_consultation(user_id, consultation_id, title="Shared an attachment")
        else:
            repo.touch_consultation(user_id, consultation_id)
        return {"userMessage": user_msg, "assistantMessage": None, "isOfflineFallback": False}

    # Build the conversation history (last 8 turns) for the AI.
    history_items = repo.list_messages(user_id, consultation_id)
    history = [
        ChatMessage(role=m["role"], content=m["content"])
        for m in history_items
        if m["role"] in ("user", "assistant") and (m.get("content") or "").strip()
    ][-8:]

    patient_profile = _patient_profile_from_profile(profile_repository.get_profile(user_id))

    text, is_offline = run_triage(history, patient_profile)

    # Parse severity/risk out of the model's JSON, if present.
    severity = None
    risk_score = None
    try:
        parsed = json.loads(text)
        severity = parsed.get("severity")
        rs = parsed.get("riskScore")
        risk_score = int(rs) if isinstance(rs, (int, float)) else None
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    # The assistant message stores the raw JSON text so the frontend can render
    # severity/advice/follow-ups consistently with the stateless endpoint.
    assistant_msg = repo.add_message(
        user_id,
        consultation_id,
        "assistant",
        text,
        severity=severity,
        risk_score=risk_score,
    )

    # First user message becomes the consultation title.
    is_first_user_msg = sum(1 for m in history_items if m["role"] == "user") == 1
    repo.touch_consultation(
        user_id,
        consultation_id,
        title=_title_from_text(content) if is_first_user_msg else None,
        last_severity=severity,
    )

    return {
        "userMessage": user_msg,
        "assistantMessage": assistant_msg,
        "isOfflineFallback": is_offline,
    }
