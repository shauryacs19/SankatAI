"""AI triage provider: an ``AIProvider`` interface with an OpenAI implementation.

The interface (dependency inversion) lets higher layers depend on an
abstraction rather than the OpenAI SDK directly, so an alternative provider can
be introduced without touching the triage service. Behavior is unchanged from
the previous implementation: gpt-4o-mini, JSON mode, temperature 0.1.
"""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Optional

from openai import OpenAI

from app.core import config
from app.schemas.triage import Message, PatientProfile

_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _extract_json(content: Optional[str]) -> str:
    """Return the JSON object from a model reply.

    Open-weight models honour JSON mode less strictly than gpt-4o — replies can
    arrive fenced in ```json or wrapped in a sentence. Strip the fence and fall
    back to the outermost {...} span; the caller validates the payload."""
    text = (content or "").strip()
    if not text:
        return "{}"
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            text = text[start:end + 1]
    return text or "{}"


# --- System prompt ---------------------------------------------------------

def build_system_prompt(profile: Optional[PatientProfile]) -> str:
    # Skip age entirely if it's 0 or empty.
    age_str = "" if profile is None or profile.age is None else str(profile.age).strip()
    has_valid_age = bool(age_str) and age_str != "0"
    age_context = f"Age: {age_str}, " if has_valid_age else ""

    gender = profile.gender if profile else None
    if not gender or gender == "Prefer not to say" or gender.strip() == "":
        gender = "Unspecified"

    if profile is not None:
        patient_info = (
            f"Patient Context -> {age_context}Gender: {gender}, "
            f"Blood: {profile.bloodGroup or 'Unknown'}. "
            f"Medical History: {profile.conditions or 'None'}. "
            f"Allergies: {profile.allergies or 'None'}. "
            f"Medications: {profile.medications or 'None'}."
        )
    else:
        patient_info = "Patient Context -> General Adult Patient. Medical History: None."

    return f"""You are Sankat AI, an elite clinical emergency triage system.

{patient_info}

CRITICAL DIRECTIVE:
If no age is explicitly listed in the Patient Context above, you MUST evaluate the patient as a standard, healthy adult. NEVER apply infant or pediatric protocols unless explicitly stated by the user in the chat.

YOUR TRIAGE ALGORITHM:
1. Identify immediate life threats (Red Flags: compromised airway, severe respiratory distress, uncontrolled hemorrhage, sudden altered mental status, chest pain radiating to arm/jaw).
2. If Red Flags are present -> IMMEDIATELY classify as EMERGENCY (Risk 90-100). Give 1-2 bullet points of immediate life-saving action.
3. If symptoms are highly concerning but not immediately fatal -> Classify as HIGH (Risk 70-89). Tell them to seek urgent medical care.
4. If the situation is ambiguous but potentially dangerous -> Output ONLY "followUpQuestions". Leave severity as null.
5. If clearly non-urgent -> Classify as LOW or MODERATE (Risk 0-69). Give home-care advice.

CRITICAL RULE:
Provide a brief user-safe explanation in the "reasoning" field. This must be a concise explanation of the assessment, NOT hidden chain-of-thought or private internal reasoning.

OUTPUT STRICTLY THIS JSON FORMAT ONLY:
{{
  "reasoning": "<A brief user-safe explanation of the assessment>",
  "followUpQuestions": ["<Question 1 (only if needed)>", "<Question 2 (only if needed)>"],
  "severity": "LOW" | "MODERATE" | "HIGH" | "EMERGENCY" | null,
  "riskScore": <integer 0-100>,
  "advice": "<Direct, actionable advice. Max 3 sentences.>",
  "disclaimer": "AI Estimate. Not medical advice."
}}"""


class AIProvider(ABC):
    """Abstraction the triage service depends on."""

    @abstractmethod
    def analyze(self, messages: list[Message], patient_profile: Optional[PatientProfile]) -> str:
        """Return a JSON string assessment. Raise on failure so the caller can
        trigger the offline fallback."""


class OpenAIProvider(AIProvider):
    """Any OpenAI-protocol endpoint, in JSON mode at temperature 0.1.

    Endpoint and model come from config (`AI_BASE_URL` / `AI_MODEL`), which
    default to Ollama Cloud (`https://ollama.com/v1`, `gpt-oss:120b`). The
    `openai` SDK is reused as the transport — Ollama exposes an OpenAI-compatible
    API, so no extra dependency is needed."""

    @lru_cache(maxsize=1)
    def _client(self) -> OpenAI:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("Missing OPENAI_API_KEY.")
        return OpenAI(api_key=api_key, base_url=config.AI_BASE_URL or None, timeout=config.AI_TIMEOUT)

    def analyze(self, messages: list[Message], patient_profile: Optional[PatientProfile]) -> str:
        client = self._client()

        full_messages = [{"role": "system", "content": build_system_prompt(patient_profile)}]
        full_messages.extend({"role": m.role, "content": m.content} for m in messages)

        response = client.chat.completions.create(
            model=config.AI_MODEL,
            messages=full_messages,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return _extract_json(content)


@lru_cache(maxsize=1)
def get_provider() -> AIProvider:
    """Default provider used by the application."""
    return OpenAIProvider()
