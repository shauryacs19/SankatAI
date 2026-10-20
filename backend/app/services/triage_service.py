"""Triage business logic.

Owns the decision of *how* an assessment is produced: use the configured
``AIProvider`` when an API key is present, otherwise (or on any provider error)
fall back to the offline keyword engine. Higher layers call ``run_triage`` and
never talk to the AI provider directly.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

import openai

from app.integrations.ai.openai_provider import AIProvider, get_provider
from app.schemas.triage import Message, PatientProfile

logger = logging.getLogger("sankatai")


# --- Offline fallback engine ----------------------------------------------

_CRITICAL_RE = re.compile(
    r"(chest|heart|breath|airway|unconscious|faint|choke|choking|stroke|droop|"
    r"poison|overdose|suicide|kill myself|allergic|anaphylaxis|seizure|fit|convulsion)"
)
_HIGH_RE = re.compile(
    r"(blood|bleed|cut|burn|broken|fracture|bone|snake|bite|pregnant|labor|"
    r"water broke|chemical)"
)
_MODERATE_RE = re.compile(
    r"(fever|cough|headache|vomit|nausea|diarrhea|sprain|twist|stomach|rash)"
)


def emergency_fallback_analyze(messages: list[Message]) -> str:
    """Keyword-based offline severity estimate. Returns a JSON string."""
    last_user_msg = ""
    for msg in reversed(messages):
        if msg.role == "user":
            last_user_msg = msg.content or ""
            break
    lower = last_user_msg.lower()

    risk = 10
    severity = "LOW"
    advice = "Monitor symptoms closely. If they worsen, consult a doctor."
    reasoning = "Fallback engine: No specific high-risk keywords detected."

    if _CRITICAL_RE.search(lower):
        risk = 95
        severity = "EMERGENCY"
        advice = "CRITICAL: Call 108 or your local emergency number IMMEDIATELY. Do not wait."
        reasoning = "Fallback engine detected critical life-threatening keywords."
    elif _HIGH_RE.search(lower):
        risk = 75
        severity = "HIGH"
        advice = (
            "Apply immediate first aid if applicable. Proceed to the nearest "
            "hospital or urgent care immediately."
        )
        reasoning = "Fallback engine detected severe trauma or acute urgent conditions."
    elif _MODERATE_RE.search(lower):
        risk = 35
        severity = "MODERATE"
        advice = (
            "Rest and stay hydrated. Consider over-the-counter medication. "
            "See a doctor if symptoms persist."
        )
        reasoning = "Fallback engine detected moderate viral, systemic, or minor physical symptoms."

    return json.dumps(
        {
            "reasoning": reasoning,
            "followUpQuestions": [],
            "severity": severity,
            "riskScore": risk,
            "advice": advice,
            "disclaimer": "OFFLINE MODE: Keyword Estimate. Not medical advice.",
        }
    )


# --- Orchestration ---------------------------------------------------------

# Terraform seeds the Secrets Manager entry with this literal (ignore_changes),
# so "key present" is not the same as "key configured".
_UNSET_KEYS = {"", "PLACEHOLDER"}


def ai_key_configured() -> bool:
    return os.getenv("OPENAI_API_KEY", "").strip() not in _UNSET_KEYS


def classify_provider_error(error: Exception) -> str:
    """Map a provider exception to a short, non-secret failure class.

    Each class points at a different fix (rotate the key, pick another model,
    check NAT egress, ...), so they must not all collapse into one log line.
    """
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return "auth_rejected"
    if isinstance(error, openai.NotFoundError):
        return "model_not_found"
    if isinstance(error, openai.RateLimitError):
        return "rate_limited"
    if isinstance(error, openai.APITimeoutError):  # subclass of APIConnectionError
        return "timeout"
    if isinstance(error, openai.APIConnectionError):
        return "unreachable"
    if isinstance(error, openai.APIStatusError):
        return f"http_{error.status_code}"
    return "other"


def run_triage(
    messages: list[Message],
    patient_profile: Optional[PatientProfile],
    provider: Optional[AIProvider] = None,
    lang: Optional[str] = None,
    *,
    session_id: Optional[str] = None,
    image_findings: Optional[list[dict]] = None,
    deadline: Optional[float] = None,
) -> tuple[str, bool]:
    """Run one triage turn. Returns ``(reply_json, is_offline_fallback)``.

    Severity always comes from the triage engine (severity model + red-flag
    rules); the LLM only phrases the question or explains the result. No usable
    key or any LLM failure -> the engine's template text, flagged
    ``is_offline_fallback=True`` so clients label it. If the engine itself fails
    (should never happen), the keyword engine below is the last resort.
    """
    from app.services import triage_engine  # local: the engine imports this module

    if not ai_key_configured():
        logger.error("AI offline fallback [missing_key]: OPENAI_API_KEY is unset or still the placeholder.")
        provider = None
    else:
        provider = provider or get_provider()
    try:
        result = triage_engine.run(messages, patient_profile, provider=provider, lang=lang, session_id=session_id,
                                   image_findings=image_findings, deadline=deadline)
        return result.content, not result.llm_used
    except Exception as error:  # noqa: BLE001 - last-resort safety net
        logger.exception("Triage engine failed (%s); keyword fallback.", type(error).__name__)
        return emergency_fallback_analyze(messages), True
