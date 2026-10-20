"""Triage engine: one assistant turn, decided by rules + model, explained by the LLM.

    transcript ──► features ──► severity model ──► red-flag floor ──► decide
                                                                      │
                     ask ONE question (max information gain) ◄────────┤ not confident yet
                     final assessment                         ◄───────┘ confident / 5 asked /
                                                                         red flag / nothing left
    LLM (temperature 0.7, top_p 0.9, per-session seed) phrases the question or
    explains the decided severity. It never sets severity: the engine overwrites
    severity/riskScore in whatever the LLM returns. No LLM -> templates.

The reply keeps the existing JSON contract (``reasoning``, ``followUpQuestions``,
``severity``, ``riskScore``, ``advice``, ``disclaimer``) so older clients keep
working, and adds ``likelyCauses``, ``homeCare``, ``warningSigns``, ``seekCare``,
``confidence``, ``safetyNote`` and a ``triage`` object (state for the next turn
and for feedback).
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Optional

from app.core import config
from app.integrations.ai.openai_provider import AIProvider
from app.ml import question_policy, red_flags
from app.ml.features import SEVERITIES, Features, Turn, build_features
from app.ml.severity_model import Prediction, get_model
from app.ml.slots import SLOTS, has_complaint
from app.schemas.triage import Message, PatientProfile
from app.services import bandit_service
from app.services.language_service import language_directive, language_reminder

logger = logging.getLogger("sankatai")

ENGINE_VERSION = 2
EMERGENCY_PROB_FLOOR = 0.4  # model alone: this much EMERGENCY mass is treated as an emergency
DISCLAIMER = "AI estimate, not a medical diagnosis. In an emergency call 108 or 112."
RISK_BANDS = {"LOW": (5, 34), "MODERATE": (35, 69), "HIGH": (70, 89), "EMERGENCY": (90, 100)}
_ANCHORS = {"LOW": 15, "MODERATE": 50, "HIGH": 78, "EMERGENCY": 95}

PROMPT_VARIANTS = {
    "ask": {
        "ask.direct": "Ask the question directly in one short sentence, mentioning their symptom so it is clearly about them.",
        "ask.empathetic": "Begin with one short, warm sentence that reflects a specific detail they told you, then ask the question.",
    },
    "final": {
        "final.structured": "Keep every list to 2-4 short, concrete items. Write 'advice' as two or three plain sentences.",
        "final.conversational": "Write 'advice' as a warm, plain-language paragraph (3-4 sentences) that ties THEIR details together. Keep lists short.",
        "final.concise": "Be brief: 'advice' in at most two sentences; at most three items per list.",
    },
}

_CALL_LINE = {
    "en": "Call 108 (ambulance) or 112 now, or go to the nearest emergency department.",
    "hi": "अभी 108 (एम्बुलेंस) या 112 पर कॉल करें, या सबसे नज़दीकी इमरजेंसी विभाग में जाएँ।",
}
_SELF_HARM_LINE = "You are not alone. Talk to someone now: Tele-MANAS 14416 (free, 24x7) or call 112."
_COMPLAINT_Q = {"en": "What symptoms are you having, and since when?", "hi": "आपको क्या तकलीफ़ है, और कब से?"}


def _lang_key(lang: Optional[str]) -> str:
    return "hi" if (lang or "").lower().startswith("hi") else "en"


def session_seed(session_id: Optional[str]) -> Optional[int]:
    if not session_id:
        return None
    return int.from_bytes(hashlib.sha256(f"sankatai-seed:{session_id}".encode()).digest()[:4], "big") & 0x7FFFFFFF


# --- transcript -----------------------------------------------------------

def _parse(content: str) -> Optional[dict]:
    try:
        value = json.loads(content)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def assistant_text(content: str) -> str:
    """What an earlier assistant turn said, as plain text for the LLM's context."""
    p = _parse(content)
    if p is None:
        return content
    if p.get("followUpQuestions"):
        return " ".join(str(q) for q in p["followUpQuestions"])
    text = str(p.get("advice") or "")
    return f"(Assessment: {p['severity']}) {text}" if p.get("severity") else text


def to_turns(messages: list[Message]) -> tuple[list[Turn], bool]:
    """Engine turns + whether a final assessment was already given."""
    turns: list[Turn] = []
    had_final = False
    legacy = 0
    for m in messages:
        if m.role == "user":
            turns.append(Turn("user", m.content))
        elif m.role == "assistant":
            p = _parse(m.content) or {}
            meta = p.get("triage") if isinstance(p.get("triage"), dict) else {}
            slot = meta.get("slot") if meta.get("mode") == "ask" else None
            if not meta and p.get("followUpQuestions"):
                legacy += 1
                slot = f"legacy#{legacy}"  # counts toward the question limit
            if p.get("severity") in SEVERITIES:
                had_final = True
            turns.append(Turn("assistant", assistant_text(m.content), slot=slot))
    return turns, had_final


def _profile_age(profile: Optional[PatientProfile]) -> Optional[float]:
    try:
        age = float(str(profile.age).strip()) if profile and profile.age not in (None, "") else None
    except ValueError:
        return None
    return age if age and age > 0 else None


# --- decision -------------------------------------------------------------

@dataclass
class Decision:
    mode: str  # "ask" | "final"
    severity: Optional[str]  # final severity (None while asking)
    provisional: str  # best guess right now (model + rules)
    confidence: float
    source: str  # "model" | "rules"
    reasons: list[str]
    slot: Optional[str]
    stop: str
    prediction: Prediction
    features: Features
    after_final: bool = False
    scores: dict = field(default_factory=dict)


def decide(f: Features, pred: Prediction, *, had_final: bool, rng: random.Random) -> Decision:
    model_sev = "EMERGENCY" if pred.probs["EMERGENCY"] >= EMERGENCY_PROB_FLOOR else pred.severity
    final_sev, source, reasons = red_flags.apply_floor(model_sev, f)
    confidence = 1.0 if source == "rules" and final_sev == "EMERGENCY" else float(pred.probs.get(final_sev, 0.0))

    def final(stop: str) -> Decision:
        return Decision("final", final_sev, final_sev, confidence, source, reasons, None, stop, pred, f, had_final)

    if final_sev == "EMERGENCY":
        return final("emergency")
    if source == "rules":
        return final("red_flag")  # a HIGH floor: urgent advice is never delayed by questions
    if had_final:
        return final("follow_up")
    if not has_complaint(f) and "complaint" not in f.asked:
        return Decision("ask", None, final_sev, confidence, source, reasons, "complaint", "no_complaint", pred, f)
    choice = question_policy.choose(get_model(), f, confidence, weight=bandit_service.slot_weight, rng=rng)
    if choice.slot is None:
        d = final(choice.reason)
        d.scores = choice.scores
        return d
    return Decision("ask", None, final_sev, confidence, source, reasons, choice.slot.id, choice.reason, pred, f,
                    scores=choice.scores)


def risk_score(severity: str, probs: dict[str, float]) -> int:
    expected = sum(probs.get(s, 0.0) * _ANCHORS[s] for s in SEVERITIES)
    lo, hi = RISK_BANDS[severity]
    return int(round(min(hi, max(lo, expected))))


# --- prompt ---------------------------------------------------------------

def _state_lines(d: Decision, profile: Optional[PatientProfile], image_findings: list[dict]) -> str:
    f = d.features
    probs = ", ".join(f"{s} {round(p * 100)}%" for s, p in d.prediction.probs.items())
    known = []
    if f.age_band != "unknown":
        known.append(f"age group {f.age_band}")
    if f.duration_band != "unknown":
        known.append(f"duration {f.duration_band}")
    if f.pain_band != "unknown":
        known.append(f"pain {f.pain_band}")
    for k, v in f.flags.items():
        if v:
            known.append(f"{k}: {'yes' if v == 1 else 'no'}")
    for k, label in (("temp_c", "temperature °C"), ("heart_rate", "pulse"), ("spo2", "SpO2 %"), ("sbp", "systolic BP"), ("resp_rate", "breaths/min")):
        if getattr(f, k) is not None:
            known.append(f"{label} {getattr(f, k)}")
    lines = [
        f"- Severity: {d.severity or 'not decided yet (still gathering information)'}"
        + (f" — decided by safety rules: {', '.join(d.reasons)}" if d.source == "rules" else " — decided by the triage model"),
        f"- Model probabilities: {probs}; current best estimate {d.provisional} ({round(d.confidence * 100)}% confident)",
        f"- Known so far: {'; '.join(known) or 'only the description'}",
        f"- Questions asked so far: {len(f.asked)} of at most {config.TRIAGE_MAX_QUESTIONS}",
    ]
    if profile:
        lines.append(
            f"- Profile: gender {profile.gender or 'unspecified'}; conditions {profile.conditions or 'none listed'}; "
            f"allergies {profile.allergies or 'none listed'}; medications {profile.medications or 'none listed'}"
        )
    for i, img in enumerate(image_findings[:3], 1):
        lines.append(
            f"- Photo {i}: region {img.get('bodyRegion') or 'unclear'}; signs {', '.join(map(str, img.get('visibleSigns') or [])) or 'none'}; "
            f"severity cue {img.get('severityCue') or 'none'}; {img.get('summary') or ''}"
        )
    return "\n".join(lines)


_RULES = """RULES:
- Be specific to THIS person: use their own details (symptom, duration, age, what they answered). No generic boilerplate.
- Never contradict or restate a different severity. Do not invent symptoms, results or a diagnosis; give likely causes as possibilities, most likely first.
- LOW: home care steps, and "see a doctor if ..." with a time frame. Do not tell them to see a doctor now.
- MODERATE: home care plus a doctor or clinic visit within 24-48 hours (or "if not better in N days" when that is appropriate).
- HIGH: get medical care today (doctor, urgent care or hospital). Only first-aid steps while they arrange care; no home-care list.
- EMERGENCY: the FIRST sentence of 'advice' tells them to call 108 (ambulance) or 112 now or go to the nearest emergency department; then 1-3 immediate first-aid steps. No home care.
- 'reasoning' is one or two sentences explaining WHY the severity is what it is, citing their details. No hidden reasoning, no chain-of-thought.
- Never claim to be a doctor."""


def build_prompt(d: Decision, variant: str, profile: Optional[PatientProfile], image_findings: list[dict], lang: Optional[str]) -> str:
    head = ("You are SankatAI, a careful medical triage assistant for people in India. "
            "A triage engine has already assessed the conversation; you EXPLAIN its decision and talk to the person. "
            "You do not decide severity.")
    state = f"TRIAGE ENGINE STATE (authoritative):\n{_state_lines(d, profile, image_findings)}"
    style = PROMPT_VARIANTS[d.mode][variant]
    if d.mode == "ask" and d.slot == "complaint":
        task = ('TASK: The person has not described a health problem yet. Greet them briefly and ask what symptoms they have '
                'and since when. Output JSON only: {"question": "...", "reasoning": ""}')
    elif d.mode == "ask":
        slot = SLOTS[d.slot]
        task = (f"TASK: Ask exactly ONE follow-up question to learn {slot.purpose}. Suggested wording: \"{slot.question_en}\". "
                "Adapt it to their situation; never ask something they already answered; no assessment yet. "
                'Output JSON only: {"question": "...", "reasoning": "<one short sentence: why this matters for them>"}')
    else:
        follow = (" The person already received an assessment; their latest message may be a follow-up question. "
                  "Answer it directly inside 'advice', keeping the assessment consistent.") if d.after_final else ""
        task = ("TASK: Write the final assessment for this person." + follow + " Output JSON only:\n"
                '{"reasoning": "...", "advice": "...", "likelyCauses": ["..."], "homeCare": ["..."], '
                '"warningSigns": ["<signs that mean they must seek care sooner>"], '
                '"seekCare": "<when and where to get care: e.g. self-care / clinic in 24-48 h / urgent care today / call 108 now>"}')
    prompt = f"{head}\n\n{state}\n\n{task}\nSTYLE: {style}\n\n{_RULES}\nKeep JSON keys in English."
    if lang:
        prompt += f"\n\nLANGUAGE:\n{language_directive(lang)}"
    return prompt


def build_messages(system: str, messages: list[Message], lang: Optional[str]) -> list[dict]:
    out = [{"role": "system", "content": system}]
    for m in messages[-8:]:
        if m.role == "user":
            out.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            out.append({"role": "assistant", "content": assistant_text(m.content)})
    if lang:
        for i in range(len(out) - 1, 0, -1):
            if out[i]["role"] == "user":
                out[i] = {**out[i], "content": f"{out[i]['content']}\n\n{language_reminder(lang)}"}
                break
    return out


# --- reply assembly -------------------------------------------------------

def _str(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _list(value, limit: int = 6) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [s for s in (_str(v, 220) for v in value[:limit]) if s]


def _template(d: Decision, lang_key: str) -> dict:
    """Used when the LLM is unavailable or returned nothing usable."""
    if d.mode == "ask":
        q = _COMPLAINT_Q[lang_key] if d.slot == "complaint" else (SLOTS[d.slot].question_hi if lang_key == "hi" else SLOTS[d.slot].question_en)
        return {"question": q, "reasoning": ""}
    sev = d.severity
    why = f" because of: {', '.join(d.reasons)}" if d.reasons else ""
    advice = {
        "LOW": "This sounds manageable at home for now. Rest, drink plenty of fluids and watch how it changes.",
        "MODERATE": "This should be checked by a doctor or clinic within the next 24-48 hours. Rest and drink fluids meanwhile.",
        "HIGH": f"Please get medical care today at a doctor, urgent-care centre or hospital{why}.",
        "EMERGENCY": f"{_CALL_LINE['en']} This needs immediate help{why}.",
    }[sev]
    seek = {
        "LOW": "Self-care at home. See a doctor if it is not better in 3 days or any warning sign appears.",
        "MODERATE": "Doctor or clinic within 24-48 hours; sooner if a warning sign appears.",
        "HIGH": "Doctor, urgent care or hospital today.",
        "EMERGENCY": "Call 108 / 112 now or go to the nearest emergency department.",
    }[sev]
    return {
        "reasoning": f"Assessed as {sev.lower()} from what you described{why}.",
        "advice": advice,
        "likelyCauses": [],
        "homeCare": ["Rest", "Drink plenty of fluids", "Note any change in your symptoms"] if sev in ("LOW", "MODERATE") else [],
        "warningSigns": ["Trouble breathing", "Chest pain", "Fainting or confusion", "Severe or rapidly worsening pain",
                         "Bleeding that will not stop"],
        "seekCare": seek,
    }


def assemble(d: Decision, llm: dict, *, variant: str, lang_key: str) -> dict:
    triage = {
        "v": ENGINE_VERSION, "mode": d.mode, "slot": d.slot, "asked": list(d.features.asked),
        "questionCount": len(d.features.asked) + (1 if d.mode == "ask" else 0),
        "modelVersion": d.prediction.model_version, "source": d.source, "stop": d.stop,
        "probs": d.prediction.probs, "modelSeverity": d.prediction.severity, "provisional": d.provisional,
        "reasons": d.reasons, "variant": variant, "features": d.features.summary(),
    }
    if d.mode == "ask":
        question = _str(llm.get("question"), 400) or _template(d, lang_key)["question"]
        note = None
        if d.provisional == "HIGH" or d.prediction.probs.get("EMERGENCY", 0) >= 0.15:
            note = "If it gets worse while we talk (trouble breathing, chest pain, fainting), call 108 straight away."
        return {
            "reasoning": _str(llm.get("reasoning"), 300), "followUpQuestions": [question], "severity": None,
            "riskScore": None, "advice": "", "safetyNote": note, "disclaimer": DISCLAIMER,
            "confidence": round(d.confidence, 3), "triage": triage,
        }

    tpl = _template(d, lang_key)
    sev = d.severity
    advice = _str(llm.get("advice"), 1200) or tpl["advice"]
    if sev == "EMERGENCY" and "108" not in advice and "112" not in advice:
        advice = f"{_CALL_LINE[lang_key]} {advice}"
    if red_flags.is_self_harm(d.features) and "14416" not in advice:
        advice = f"{advice} {_SELF_HARM_LINE}"
    home = _list(llm.get("homeCare")) if sev in ("LOW", "MODERATE") else []
    return {
        "reasoning": _str(llm.get("reasoning"), 500) or tpl["reasoning"],
        "followUpQuestions": [],
        "severity": sev,
        "riskScore": risk_score(sev, d.prediction.probs) if d.source == "model" else max(risk_score(sev, d.prediction.probs), RISK_BANDS[sev][0]),
        "advice": advice,
        "likelyCauses": _list(llm.get("likelyCauses"), 4),
        "homeCare": home or (tpl["homeCare"] if sev in ("LOW", "MODERATE") and not llm else home),
        "warningSigns": _list(llm.get("warningSigns")) or tpl["warningSigns"],
        "seekCare": _str(llm.get("seekCare"), 300) or tpl["seekCare"],
        "disclaimer": DISCLAIMER,
        "confidence": round(d.confidence, 3),
        "triage": triage,
    }


# --- entry point ----------------------------------------------------------

@dataclass
class EngineResult:
    reply: dict
    llm_used: bool

    @property
    def content(self) -> str:
        return json.dumps(self.reply, ensure_ascii=False)


def run(
    messages: list[Message],
    profile: Optional[PatientProfile],
    *,
    provider: Optional[AIProvider],
    lang: Optional[str] = None,
    session_id: Optional[str] = None,
    image_findings: Optional[list[dict]] = None,
    deadline: Optional[float] = None,
) -> EngineResult:
    images = [i for i in (image_findings or []) if isinstance(i, dict) and i.get("isMedical", True)]
    turns, had_final = to_turns(messages)
    f = build_features(
        turns, profile_age=_profile_age(profile), profile_conditions=profile.conditions if profile else None,
        profile_gender=profile.gender if profile else None, image_findings=images,
    )
    seed = session_seed(session_id)
    rng = random.Random((seed or 0) + len(messages))
    d = decide(f, get_model().predict(f), had_final=had_final, rng=rng)
    variant = bandit_service.pick(PROMPT_VARIANTS[d.mode], rng)
    lang_key = _lang_key(lang)

    llm: dict = {}
    remaining = (deadline - time.monotonic()) if deadline else config.AI_TIMEOUT
    if provider is not None and remaining >= 3:
        try:
            system = build_prompt(d, variant, profile, images, lang)
            raw = provider.generate(build_messages(system, messages, lang), seed=seed, timeout=min(config.AI_TIMEOUT, remaining))
            parsed = json.loads(raw)
            llm = parsed if isinstance(parsed, dict) else {}
        except Exception as error:  # noqa: BLE001 - template reply below
            from app.services.triage_service import classify_provider_error
            logger.error("AI generation failed [%s]: %s", classify_provider_error(error), type(error).__name__)
            llm = {}
    usable = bool(llm.get("question") if d.mode == "ask" else llm.get("advice"))
    # Template text is English: offline replies are stored as en-IN (read-aloud, translate).
    reply = assemble(d, llm if usable else {}, variant=variant, lang_key=lang_key if usable else "en")
    logger.info("triage turn mode=%s severity=%s source=%s stop=%s slot=%s conf=%.2f model=%s llm=%s",
                d.mode, d.severity, d.source, d.stop, d.slot, d.confidence, d.prediction.model_version, usable)
    return EngineResult(reply, usable)
