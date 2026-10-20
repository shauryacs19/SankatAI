"""Follow-up question slots: the missing features the triage engine can ask about.

Each slot knows: when it is still unknown, when it is relevant, the possible
answers with a prior (for expected information gain), how to apply an answer to
a ``Features`` copy (to simulate it), and how to parse a real reply. The canonical
wording is a fallback and a hint; the LLM phrases the actual question.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

from app.ml.features import (
    Features,
    find,
    normalize,
    parse_age,
    parse_duration,
    parse_pain,
    parse_temperature,
    tokenize,
)

_YES = re.compile(r"^(?:yes|yeah|yep|yup|ya|yah|haa?n?|hanji|ji haa?n|ji|हाँ|हां|जी|sure|correct|right|it is|i do|i am|i have|true|definitely)\b")
_NO = re.compile(r"^(?:no|nope|nah|not really|not at all|none|never|nahi|nahin|nhi|nai|नहीं|नही|na\b|i don'?t|i do not|i'm not|i am not)\b")


def parse_yes_no(text: str) -> Optional[int]:
    t = normalize(text).lstrip("., ")
    if _NO.match(t):
        return -1
    if _YES.match(t):
        return 1
    return None


@dataclass(frozen=True)
class Slot:
    id: str
    question_en: str
    question_hi: str
    purpose: str  # what the answer tells us (shown to the LLM)
    values: tuple[tuple[str, float], ...]  # (value, prior); priors sum to 1
    is_known: Callable[[Features], bool]
    relevant: Callable[[Features], bool]
    apply: Callable[[Features, str], None]
    parse: Callable[[str], Optional[str]]


def _tristate_slot(key: str, q_en: str, q_hi: str, purpose: str, p_yes: float,
                   relevant: Callable[[Features], bool] = lambda f: True) -> Slot:
    def apply(f: Features, value: str) -> None:
        f.flags[key] = 1 if value == "yes" else -1

    def parse(text: str) -> Optional[str]:
        yn = parse_yes_no(text)
        return None if yn is None else ("yes" if yn == 1 else "no")

    return Slot(key, q_en, q_hi, purpose, (("yes", p_yes), ("no", 1 - p_yes)),
                is_known=lambda f: f.flags.get(key, 0) != 0, relevant=relevant, apply=apply, parse=parse)


# Representative values used to simulate an answer.
_DURATION_DAYS = {"hours": 0.3, "days": 2.0, "week": 7.0, "chronic": 30.0}
_AGE_YEARS = {"infant": 0.5, "child": 7.0, "teen": 15.0, "adult": 35.0, "senior": 72.0}
_PAIN_SCORE = {"none": 0.0, "mild": 2.0, "moderate": 5.0, "severe": 8.0}
_TEMP_C = {"normal": 37.2, "fever": 38.4, "high": 39.4, "very_high": 40.3}

_SKIN = re.compile(r"rash|skin|itch\w*|red(?:ness)?|swell\w*|wound|cut|burn|bite|blister|boil|pus|lump|spot|daan[ae]|खुजली|दाने")
_ABDOMEN = re.compile(r"stomach|abdom\w*|belly|pelvi\w*|period|vagin\w*|pet\b|पेट")
_INJURY = re.compile(r"cut|wound|injur\w*|fell|fall|accident|hit|bite|bleed\w*|blood|nose ?bleed|chot|चोट")
_BREATH_RELATED = re.compile(r"cough|breath|chest|wheez|cold|asthma|throat|khansi|खांसी|saa?ns|सांस")


def _duration_parse(text: str) -> Optional[str]:
    days = parse_duration(text)
    if days is None:
        m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*$", text)
        days = float(m.group(1)) if m else None  # bare "3" after "how many days?"
    if days is None:
        return None
    from app.ml.features import duration_band
    return duration_band(days)


def _duration_apply(f: Features, value: str) -> None:
    f.duration_days = _DURATION_DAYS[value]


def _age_parse(text: str) -> Optional[str]:
    age = parse_age(text)
    if age is None:
        m = re.match(r"^\s*(\d{1,3})\s*$", text)
        age = float(m.group(1)) if m and 0 < int(m.group(1)) < 120 else None
    if age is None:
        return None
    from app.ml.features import age_band
    return age_band(age)


def _age_apply(f: Features, value: str) -> None:
    f.age = _AGE_YEARS[value]


def _pain_parse(text: str) -> Optional[str]:
    score = parse_pain(text)
    if score is None:
        m = re.match(r"^\s*(\d{1,2})\s*$", text)
        score = float(m.group(1)) if m and int(m.group(1)) <= 10 else None
    if score is None and parse_yes_no(text) == -1:
        score = 0.0
    if score is None:
        return None
    from app.ml.features import pain_band
    return pain_band(score)


def _pain_apply(f: Features, value: str) -> None:
    f.pain = _PAIN_SCORE[value]


def _temp_parse(text: str) -> Optional[str]:
    c = parse_temperature(text)
    if c is None:
        m = re.match(r"^\s*(\d{2,3}(?:\.\d)?)\s*$", text)
        if m:
            from app.ml.features import to_celsius
            c = to_celsius(float(m.group(1)))
    if c is None:
        return None
    return "normal" if c < 38 else "fever" if c < 39 else "high" if c < 40 else "very_high"


def _temp_apply(f: Features, value: str) -> None:
    f.temp_c = _TEMP_C[value]
    f.flags["fever"] = 1 if value != "normal" else f.flags.get("fever", 0)


SLOTS: dict[str, Slot] = {s.id: s for s in (
    Slot("duration", "How long have you had these symptoms?", "ये लक्षण कब से हैं?",
         "how long the symptoms have lasted",
         (("hours", 0.25), ("days", 0.4), ("week", 0.2), ("chronic", 0.15)),
         is_known=lambda f: f.duration_days is not None, relevant=lambda f: True,
         apply=_duration_apply, parse=_duration_parse),
    Slot("age", "How old is the person who is unwell?", "जिनकी तबीयत खराब है, उनकी उम्र क्या है?",
         "the patient's age group",
         (("infant", 0.05), ("child", 0.15), ("teen", 0.1), ("adult", 0.5), ("senior", 0.2)),
         is_known=lambda f: f.age is not None, relevant=lambda f: True,
         apply=_age_apply, parse=_age_parse),
    Slot("pain", "On a scale of 0 to 10, how bad is the pain or discomfort?", "0 से 10 के पैमाने पर दर्द कितना है?",
         "how severe the pain is",
         (("none", 0.15), ("mild", 0.35), ("moderate", 0.3), ("severe", 0.2)),
         is_known=lambda f: f.pain is not None, relevant=lambda f: True,
         apply=_pain_apply, parse=_pain_parse),
    _tristate_slot("fever", "Do you have a fever or feel hot and shivery?", "क्या बुखार है या कंपकंपी हो रही है?",
                   "whether there is a fever", 0.4),
    Slot("temperature", "If you have a thermometer, what is the temperature?", "थर्मामीटर हो तो तापमान कितना है?",
         "how high the fever is",
         (("normal", 0.15), ("fever", 0.45), ("high", 0.3), ("very_high", 0.1)),
         is_known=lambda f: f.temp_c is not None, relevant=lambda f: f.flags.get("fever") == 1,
         apply=_temp_apply, parse=_temp_parse),
    _tristate_slot("breathing", "Are you short of breath, or is breathing harder than usual?",
                   "क्या सांस फूल रही है या सांस लेने में तकलीफ़ है?",
                   "whether breathing is affected", 0.25,
                   relevant=lambda f: bool(_BREATH_RELATED.search(f.text)) or f.flags.get("fever") == 1),
    _tristate_slot("vomiting", "Are you vomiting or unable to keep fluids down?", "क्या उल्टी हो रही है या पानी भी नहीं टिक रहा?",
                   "dehydration risk", 0.3),
    _tristate_slot("bleeding", "Is there any bleeding?", "क्या कहीं से खून आ रहा है?",
                   "whether there is bleeding", 0.25, relevant=lambda f: bool(_INJURY.search(f.text)) or bool(_ABDOMEN.search(f.text))),
    _tristate_slot("worsening", "Is it getting worse quickly?", "क्या यह तेज़ी से बिगड़ रहा है?",
                   "how fast it is changing", 0.35),
    _tristate_slot("chronic", "Do you have a long-term condition like diabetes, heart, lung or kidney disease?",
                   "क्या डायबिटीज़, दिल, फेफड़े या किडनी की कोई पुरानी बीमारी है?",
                   "underlying conditions that raise risk", 0.3),
    _tristate_slot("pregnant", "Is there any chance you could be pregnant?", "क्या गर्भवती होने की कोई संभावना है?",
                   "pregnancy, which changes what is safe", 0.15,
                   relevant=lambda f: (f.gender or "").lower() not in {"male", "m"}
                   and f.age_band in ("teen", "adult", "unknown") and bool(_ABDOMEN.search(f.text))),
    _tristate_slot("spreading", "Is the rash, redness or swelling spreading?", "क्या दाने, लाली या सूजन फैल रही है?",
                   "whether a skin problem is spreading", 0.35,
                   relevant=lambda f: bool(_SKIN.search(f.text)) or f.image_cue is not None),
)}


def candidates(f: Features) -> list[Slot]:
    """Slots that are unknown, relevant, and not asked before in this session."""
    return [s for s in SLOTS.values() if s.id not in f.asked and not s.is_known(f) and s.relevant(f)]


_SYMPTOM = re.compile(
    r"pain|ache|hurt|fever|cough|cold|flu|vomit|nausea|dizz|headache|migraine|rash|itch|swell|bleed|blood|burn|"
    r"\bcut\b|bite|injur|tired|weak|diarrh|loose motion|constipat|breath|chest|stomach|throat|\bear\b|\beye|tooth|"
    r"sick|\bill\b|unwell|infect|sore|cramp|faint|numb|tingl|sneez|runny|congest|wound|lump|discharge|urin|"
    r"dard|bukh?aa?r|khansi|khaa?nsi|ulti|chakkar|dast|zukaam|jalan|sujan|दर्द|बुखार|खांसी|उल्टी|चक्कर|दस्त|जुकाम|सूजन|जलन"
)


def has_complaint(f: Features) -> bool:
    """False for an opener with no symptom in it ("hi", "can you help?") and no image."""
    return (f.image_cue is not None or bool(f.red_flags) or any(f.flags.values())
            or bool(_SYMPTOM.search(f.text)) or len(tokenize(f.text)) >= 6)


__all__ = ["SLOTS", "Slot", "candidates", "has_complaint", "parse_yes_no", "find"]
