"""Triage engine: severity from the model + safety rules, the conversation from the LLM.

    transcript ──► features ──► severity model ──► red-flag floor ──► severity (authoritative)
                                                                          │
    LLM (Ollama; temperature 0.2, top_p 0.85, per-session seed) gets that state and
    replies EITHER with its own follow-up questions (wording, answer kind and
    options are the LLM's; the app shows them as a questionnaire) OR with the
    assessment that explains the decided severity.

The engine only decides when asking is NOT allowed: an emergency or an urgent
red flag (answer now), right after the person answered a questionnaire, and
offline. It never writes questions itself. Offline (no key, error, timeout) the
reply is a labelled estimate from templates, with the same severity.

The reply keeps the existing JSON contract (``reasoning``, ``followUpQuestions``,
``severity``, ``riskScore``, ``advice``, ``disclaimer``) so older clients keep
working (they show ``followUpQuestions`` as a list), and adds ``questionnaire``,
``likelyCauses``, ``homeCare``, ``warningSigns``, ``seekCare``, ``confidence``,
``safetyNote``, ``care`` (``{issue, specialty}``: what the problem is about, for the
nearby hospitals/clinics search) and a ``triage`` object (state for the next turn
and for feedback).
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Optional

from app.core import config
from app.integrations.ai.openai_provider import AIProvider
from app.ml import red_flags
from app.ml.features import SEVERITIES, Features, Turn, build_features
from app.ml.severity_model import Prediction, get_model
from app.ml.slots import has_complaint
from app.schemas.triage import Message, PatientProfile
from app.services import bandit_service
from app.services.nearby_care_service import SPECIALTIES, care_focus
from app.services.language_service import language_directive, language_reminder

logger = logging.getLogger("sankatai")

ENGINE_VERSION = 3
EMERGENCY_PROB_FLOOR = 0.4  # model alone: this much EMERGENCY mass is treated as an emergency
DISCLAIMER = "AI estimate, not a medical diagnosis. In an emergency call 108 or 112."
RISK_BANDS = {"LOW": (5, 34), "MODERATE": (35, 69), "HIGH": (70, 89), "EMERGENCY": (90, 100)}
_ANCHORS = {"LOW": 15, "MODERATE": 50, "HIGH": 78, "EMERGENCY": 95}
KINDS = ("yes_no", "choice", "text")

# Assessment style variants; the bandit learns which one people rate helpful.
PROMPT_VARIANTS = {
    "final.structured": "Keep every list to 2-4 short, concrete items. Write 'advice' as two or three plain sentences.",
    "final.conversational": "Write 'advice' as a warm, plain-language paragraph (3-4 sentences) that ties THEIR details together. Keep lists short.",
    "final.concise": "Be brief: 'advice' in at most two sentences; at most three items per list.",
}

_CALL_LINE = {
    "en": "Call 108 (ambulance) or 112 now, or go to the nearest emergency department.",
    "hi": "अभी 108 (एम्बुलेंस) या 112 पर कॉल करें, या सबसे नज़दीकी इमरजेंसी विभाग में जाएँ।",
}
_SELF_HARM_LINE = "You are not alone. Talk to someone now: Tele-MANAS 14416 (free, 24x7) or call 112."
_DESCRIBE = {"en": "Please tell me what symptoms you have and since when.", "hi": "कृपया बताएं कि आपको क्या तकलीफ़ है और कब से।"}
_YES_NO = {"en": ("Yes", "No"), "hi": ("हाँ", "नहीं")}


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


@dataclass
class Transcript:
    turns: list[Turn]
    had_final: bool  # an assessment was already given
    just_asked: bool  # the latest assistant turn asked questions (they are being answered now)


def to_turns(messages: list[Message]) -> Transcript:
    turns: list[Turn] = []
    had_final = just_asked = False
    legacy = 0
    for m in messages:
        if m.role == "user":
            a = m.answers
            turns.append(Turn("user", m.content, answers=[i.model_dump() for i in a.items] if a else None,
                              note=a.note if a else None))
        elif m.role == "assistant":
            p = _parse(m.content) or {}
            meta = p.get("triage") if isinstance(p.get("triage"), dict) else {}
            # A questions turn, once the problem was known ("what's wrong?" does not use up the round).
            asked = (meta.get("mode") == "ask" and meta.get("complaint", True)) or (not meta and bool(p.get("followUpQuestions")))
            # Engine v2 asked one slot at a time: a reply to it is still parsed for that slot.
            slot = meta.get("slot") if meta.get("mode") == "ask" and isinstance(meta.get("slot"), str) else None
            if not meta and asked:
                legacy += 1
                slot = f"legacy#{legacy}"
            if p.get("severity") in SEVERITIES:
                had_final = True
            just_asked = asked
            turns.append(Turn("assistant", assistant_text(m.content), slot=slot))
    return Transcript(turns, had_final, just_asked)


def _profile_age(profile: Optional[PatientProfile]) -> Optional[float]:
    try:
        age = float(str(profile.age).strip()) if profile and profile.age not in (None, "") else None
    except ValueError:
        return None
    return age if age and age > 0 else None


# --- decision -------------------------------------------------------------

@dataclass
class Decision:
    severity: str  # model + rules; authoritative for any assessment
    confidence: float
    source: str  # "model" | "rules"
    reasons: list[str]
    prediction: Prediction
    features: Features
    may_ask: bool  # whether the LLM may ask questions this turn
    why: str  # emergency | red_flag | answered | follow_up | open
    after_final: bool = False


def decide(f: Features, pred: Prediction, t: Transcript) -> Decision:
    model_sev = "EMERGENCY" if pred.probs["EMERGENCY"] >= EMERGENCY_PROB_FLOOR else pred.severity
    severity, source, reasons = red_flags.apply_floor(model_sev, f)
    confidence = 1.0 if source == "rules" and severity == "EMERGENCY" else float(pred.probs.get(severity, 0.0))
    if severity == "EMERGENCY":
        may_ask, why = False, "emergency"
    elif source == "rules":
        may_ask, why = False, "red_flag"  # urgent advice is never delayed by questions
    elif t.just_asked:
        may_ask, why = False, "answered"  # one round of questions, then the assessment
    else:
        may_ask, why = True, "follow_up" if t.had_final else "open"
    return Decision(severity, confidence, source, reasons, pred, f, may_ask, why, t.had_final)


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
        f"- Severity: {d.severity}"
        + (f" — decided by safety rules: {', '.join(d.reasons)}" if d.source == "rules" else " — decided by the triage model"),
        f"- Model probabilities: {probs} ({round(d.confidence * 100)}% confident)",
        f"- Known so far: {'; '.join(known) or 'only the description'}",
    ]
    if profile:
        lines.append(
            f"- Profile: gender {profile.gender or 'unspecified'}; conditions {profile.conditions or 'none listed'}; "
            f"allergies {profile.allergies or 'none listed'}; medications {profile.medications or 'none listed'}"
        )
    for doc in (getattr(profile, "documents", None) or [])[:5]:
        lines.append(f"- Their document \"{doc.get('name')}\" (uploaded {doc.get('date') or 'unknown date'}): {doc.get('summary')}")
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
- Base likely causes on standard clinical knowledge and the details given; list only causes that fit ALL their symptoms, age and duration. If the details fit several causes equally, say so and name what would tell them apart.
- Use correct medical facts only (common Indian OTC names like paracetamol are fine; give doses only as "as per the label"). If unsure, say you are unsure rather than guess.
- Re-read the whole conversation before replying; never ask again for something already answered and never drop an earlier symptom.
- Use their shared documents only when relevant to the current problem; cite the document by name, note if it may be outdated, and never let it override what they tell you now.
- Never claim to be a doctor."""

_ASSESSMENT_JSON = ('{"type": "assessment", "reasoning": "...", "advice": "...", "likelyCauses": ["..."], "homeCare": ["..."], '
                    '"warningSigns": ["<signs that mean they must seek care sooner>"], '
                    '"seekCare": "<when and where to get care: e.g. self-care / clinic in 24-48 h / urgent care today / call 108 now>", '
                    '"care": {"issue": "<2-5 words naming the problem, e.g. Ankle sprain>", '
                    f'"specialty": "<the ONE kind of doctor/clinic that treats it: {" | ".join(SPECIALTIES)}>"}}}}')
_QUESTIONS_JSON = ('{"type": "questions", "intro": "<one short sentence: why you ask>", "questions": [{"label": "<2-4 word '
                   'summary, e.g. How long>", "question": "...", "kind": "yes_no" | "choice" | "text", "options": ["..."], '
                   '"allowOther": true}]}')
_WHY_NOT_ASK = {
    "emergency": "This is an emergency: give the assessment now, with no questions.",
    "red_flag": "A safety rule requires urgent care: give the assessment now, with no questions.",
    "answered": "They have just answered your questions: give the assessment now, with no more questions.",
}


def build_prompt(d: Decision, variant: str, profile: Optional[PatientProfile], image_findings: list[dict], lang: Optional[str]) -> str:
    head = ("You are SankatAI, a careful medical triage assistant for people in India. A triage engine has already "
            "decided the severity; you talk to the person and explain it. You do not decide severity.")
    state = f"TRIAGE ENGINE STATE (authoritative):\n{_state_lines(d, profile, image_findings)}"
    follow = (" They already received an assessment; if their message is a follow-up question, answer it inside "
              "'advice', keeping the assessment consistent.") if d.after_final else ""
    if d.may_ask:
        task = (
            "TASK: Reply in ONE of two ways." + follow + "\n"
            f"(a) If you need more details to give specific, safe advice, ask up to {config.TRIAGE_MAX_QUESTIONS} short "
            "follow-up questions together, in this one message: only what you really need, never what they already told "
            "you. The app shows tappable answers, so make every question answerable with a tap: kind \"yes_no\" for a "
            "yes/no question; kind \"choice\" with 2-6 short options (and \"allowOther\": true when they may need their own "
            "words); kind \"text\" only when options cannot work. If they have not described a health problem yet, ask "
            f"what is wrong (kind \"text\"). Output: {_QUESTIONS_JSON}\n"
            f"(b) Otherwise give the assessment. Output: {_ASSESSMENT_JSON}\n"
            f"The triage model is {round(d.confidence * 100)}% confident. When it is at least "
            f"{round(config.TRIAGE_CONFIDENCE_THRESHOLD * 100)}% confident and you know their key details, assess now."
        )
    else:
        task = f"TASK: {_WHY_NOT_ASK.get(d.why, 'Give the assessment now.')}{follow} Output JSON only: {_ASSESSMENT_JSON}"
    prompt = (f"{head}\n\n{state}\n\n{task}\nSTYLE for an assessment: {PROMPT_VARIANTS[variant]}\n\n{_RULES}\n"
              "Output JSON only. Keep JSON keys and kind values in English.")
    if lang:
        prompt += f"\n\nLANGUAGE:\n{language_directive(lang)}"
    return prompt


def build_messages(system: str, messages: list[Message], lang: Optional[str]) -> list[dict]:
    out = [{"role": "system", "content": system}]
    for m in messages[-config.AI_HISTORY_MESSAGES:]:
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


def _question_item(i: int, q: dict, lang_key: str) -> Optional[dict]:
    """One of the LLM's questions, made safe to render: bounded text, a known
    kind, yes/no as exactly two options, choices as 2-6 distinct options."""
    text = _str(q.get("question"), 300)
    if not text:
        return None
    kind = q.get("kind") if q.get("kind") in KINDS else ("choice" if q.get("options") else "text")
    options = list(dict.fromkeys(o for o in (_str(x, 80) for x in (q.get("options") or [])) if o))[:6]
    allow_other = False
    if kind == "yes_no":
        options = options if len(options) == 2 else list(_YES_NO[lang_key])
    elif kind == "choice" and len(options) >= 2:
        allow_other = q.get("allowOther") is not False
    else:
        kind, options = "text", []
    item = {"id": f"q{i}", "short": _str(q.get("label"), 40) or text[:40], "question": text, "kind": kind,
            "options": [{"value": o, "label": o} for o in options]}
    if allow_other:
        item["allowOther"] = True
    return item


def llm_questions(llm: dict, lang_key: str) -> list[dict]:
    raw = llm.get("questions") if isinstance(llm.get("questions"), list) else []
    items = [_question_item(i, q, lang_key) for i, q in enumerate(raw, 1) if isinstance(q, dict)]
    return [it for it in items if it][: config.TRIAGE_MAX_QUESTIONS]


def _template(d: Decision) -> dict:
    """The assessment when the LLM is unavailable or returned nothing usable."""
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
        "homeCare": ["Rest", "Drink plenty of fluids", "Note any change in your symptoms"] if sev in ("LOW", "MODERATE") else [],
        "warningSigns": ["Trouble breathing", "Chest pain", "Fainting or confusion", "Severe or rapidly worsening pain",
                         "Bleeding that will not stop"],
        "seekCare": seek,
    }


def _meta(d: Decision, mode: str, variant: str, count: int = 0) -> dict:
    return {
        "v": ENGINE_VERSION, "mode": mode, "questions": count, "modelVersion": d.prediction.model_version,
        "source": d.source, "stop": d.why, "probs": d.prediction.probs, "modelSeverity": d.prediction.severity,
        "provisional": d.severity, "reasons": d.reasons, "variant": variant, "features": d.features.summary(),
    }


def ask_reply(d: Decision, items: list[dict], intro: str, variant: str) -> dict:
    note = None
    if d.severity == "HIGH" or d.prediction.probs.get("EMERGENCY", 0) >= 0.15:
        note = "If it gets worse while we talk (trouble breathing, chest pain, fainting), call 108 straight away."
    return {
        "reasoning": intro,
        # The same questions as a plain list, for clients without the questionnaire UI (mobile).
        "followUpQuestions": [it["question"] for it in items], "questionnaire": items,
        "severity": None, "riskScore": None, "advice": "", "safetyNote": note, "disclaimer": DISCLAIMER,
        "confidence": round(d.confidence, 3),
        "triage": {**_meta(d, "ask", variant, len(items)), "complaint": has_complaint(d.features)},
    }


def assessment_reply(d: Decision, llm: dict, *, variant: str, lang_key: str, user_text: str = "") -> dict:
    tpl = _template(d)
    sev = d.severity
    advice = _str(llm.get("advice"), 1200) or tpl["advice"]
    if sev == "EMERGENCY" and "108" not in advice and "112" not in advice:
        advice = f"{_CALL_LINE[lang_key]} {advice}"
    if red_flags.is_self_harm(d.features) and "14416" not in advice:
        advice = f"{advice} {_SELF_HARM_LINE}"
    home = _list(llm.get("homeCare")) if sev in ("LOW", "MODERATE") else []
    risk = risk_score(sev, d.prediction.probs)
    causes = _list(llm.get("likelyCauses"), 4)
    return {
        "reasoning": _str(llm.get("reasoning"), 500) or tpl["reasoning"],
        "followUpQuestions": [],
        "severity": sev,
        "riskScore": risk if d.source == "model" else max(risk, RISK_BANDS[sev][0]),
        "advice": advice,
        "likelyCauses": causes,
        "homeCare": home or (tpl["homeCare"] if not llm else []),
        "warningSigns": _list(llm.get("warningSigns")) or tpl["warningSigns"],
        "seekCare": _str(llm.get("seekCare"), 300) or tpl["seekCare"],
        "care": care_focus(llm.get("care"), user_text, causes),
        "disclaimer": DISCLAIMER,
        "confidence": round(d.confidence, 3),
        "triage": _meta(d, "final", variant),
    }


def offline_reply(d: Decision, variant: str, user_text: str = "") -> dict:
    """No LLM: an estimate with the same severity. Never questions of our own;
    only a request to describe the problem when nothing was described."""
    if d.may_ask and not d.after_final and not has_complaint(d.features):
        return {"reasoning": "", "followUpQuestions": [_DESCRIBE["en"]], "severity": None, "riskScore": None,
                "advice": "", "disclaimer": DISCLAIMER, "confidence": round(d.confidence, 3),
                "triage": _meta(d, "describe", variant)}
    return assessment_reply(d, {}, variant=variant, lang_key="en", user_text=user_text)  # template text is English (stored as en-IN)


# --- entry point ----------------------------------------------------------

@dataclass
class EngineResult:
    reply: dict
    llm_used: bool

    @property
    def content(self) -> str:
        return json.dumps(self.reply, ensure_ascii=False)


def _call_llm(provider, d, variant, profile, images, messages, lang, seed, deadline) -> dict:
    remaining = (deadline - time.monotonic()) if deadline else config.AI_TIMEOUT
    if provider is None or remaining < 3:
        return {}
    try:
        system = build_prompt(d, variant, profile, images, lang)
        raw = provider.generate(build_messages(system, messages, lang), seed=seed, timeout=min(config.AI_TIMEOUT, remaining))
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as error:  # noqa: BLE001 - offline reply below
        from app.services.triage_service import classify_provider_error
        logger.exception("AI generation failed [%s]: %s", classify_provider_error(error), type(error).__name__)
        return {}


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
    t = to_turns(messages)
    f = build_features(
        t.turns, profile_age=_profile_age(profile), profile_conditions=profile.conditions if profile else None,
        profile_gender=profile.gender if profile else None, image_findings=images,
    )
    seed = session_seed(session_id)
    rng = random.Random((seed or 0) + len(messages))
    d = decide(f, get_model().predict(f), t)
    variant = bandit_service.pick(PROMPT_VARIANTS, rng)
    lang_key = _lang_key(lang)

    llm = _call_llm(provider, d, variant, profile, images, messages, lang, seed, deadline)
    user_text = " ".join(m.content for m in messages if m.role == "user")
    items = llm_questions(llm, lang_key) if d.may_ask and llm.get("type") != "assessment" else []
    if items:
        reply, used = ask_reply(d, items, _str(llm.get("intro"), 300), variant), True
    elif llm.get("advice"):
        reply, used = assessment_reply(d, llm, variant=variant, lang_key=lang_key, user_text=user_text), True
    else:
        reply, used = offline_reply(d, variant, user_text), False
    logger.info("triage turn mode=%s severity=%s source=%s why=%s questions=%d conf=%.2f model=%s llm=%s",
                reply["triage"]["mode"], d.severity, d.source, d.why, len(items), d.confidence,
                d.prediction.model_version, used)
    return EngineResult(reply, used)
