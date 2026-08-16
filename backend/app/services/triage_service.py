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

def run_triage(
    messages: list[Message],
    patient_profile: Optional[PatientProfile],
    provider: Optional[AIProvider] = None,
) -> tuple[str, bool]:
    """Run an assessment. Returns ``(text, is_offline_fallback)``.

    Mirrors the previous behavior: no API key -> straight to fallback; any
    provider error -> graceful fallback.
    """
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning("API Key missing! Triggering Fallback Engine.")
        return emergency_fallback_analyze(messages), True

    try:
        provider = provider or get_provider()
        return provider.analyze(messages, patient_profile), False
    except Exception as error:  # noqa: BLE001 - any failure => graceful fallback
        logger.error("OpenAI Analyze error intercepted: %s", error)
        return emergency_fallback_analyze(messages), True
