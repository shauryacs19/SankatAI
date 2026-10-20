"""Feature extraction for the severity model.

One function, ``build_features``, turns a conversation (user turns, the slot
each assistant question asked, the profile and any image findings) into a
``Features`` record. Training builds its rows through the same function, so
serve-time features always match train-time features.

Parsing is regex-based (English, Hinglish, Devanagari): no model call, no
latency, deterministic. Anything it cannot read stays ``unknown``, which the
question policy treats as a gap worth asking about.
"""

from __future__ import annotations

import copy
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable, Optional

FEATURE_SCHEMA = 1

SEVERITIES = ("LOW", "MODERATE", "HIGH", "EMERGENCY")

AGE_BANDS = ("infant", "child", "teen", "adult", "senior", "unknown")
DURATION_BANDS = ("hours", "days", "week", "chronic", "unknown")
PAIN_BANDS = ("none", "mild", "moderate", "severe", "unknown")
IMAGE_CUES = ("none", "mild", "moderate", "severe")
TRISTATE = ("fever", "breathing", "vomiting", "bleeding", "worsening", "chronic", "pregnant", "spreading")

# Order is part of the model artifact (coefficients are positional).
STRUCT_FEATURES: tuple[str, ...] = (
    *(f"age_{b}" for b in AGE_BANDS),
    *(f"dur_{b}" for b in DURATION_BANDS),
    *(f"pain_{b}" for b in PAIN_BANDS),
    *TRISTATE,
    "temp_high", "temp_very_high", "hr_high", "spo2_low", "spo2_critical",
    "sbp_low", "sbp_high", "rr_high", "vitals_present",
    "rf_count",
    "img_present", "img_mild", "img_moderate", "img_severe",
)


# --- text normalisation ---------------------------------------------------

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "").lower()
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    return re.sub(r"\s+", " ", text).strip()


# Latin letters, or Devanagari letters + vowel signs (U+0900-0963, 0970-097F);
# danda and Devanagari digits split words. Shared with the TF-IDF vocabulary.
TOKEN_RE = re.compile(r"[a-zऀ-ॣ॰-ॿ]{2,}")


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text)


# --- negation-aware keyword search ---------------------------------------

_NEG_BEFORE = re.compile(
    r"\b(no|not|without|denies|deny|never|none|neither|nor|don'?t have|do not have|"
    r"haven'?t|have not|hasn'?t|isn'?t|aren'?t|wasn'?t|free of|absence of)\b"
)
_NEG_AFTER = re.compile(r"^\W*(?:\S+\s+){0,2}?(nahi|nahin|nhi|nai|नहीं|नही|na)\b")


_CLAUSE = re.compile(r"[,.;:!?।]|\b(?:but|however|though|although|except|lekin|magar|par|पर|लेकिन|मगर)\b")


def negated(text: str, start: int, end: int) -> bool:
    """True when the match at [start, end) is negated: an English negator in
    the 4 words before it, or a Hindi one (nahi/नहीं) within 3 words after.
    Negation never crosses a clause ("no fever, but vomiting")."""
    before = text[max(0, start - 40):start]
    cuts = list(_CLAUSE.finditer(before))
    if cuts:
        before = before[cuts[-1].end():]
    if _NEG_BEFORE.search(" ".join(before.split()[-4:])):
        return True
    after = text[end:end + 30]
    cut = _CLAUSE.search(after)
    return bool(_NEG_AFTER.search(after[:cut.start()] if cut else after))


def find(pattern: re.Pattern, text: str) -> int:
    """1 = mentioned, -1 = only mentioned negated, 0 = not mentioned."""
    seen_neg = False
    for m in pattern.finditer(text):
        if not negated(text, m.start(), m.end()):
            return 1
        seen_neg = True
    return -1 if seen_neg else 0


KEYWORDS: dict[str, re.Pattern] = {
    "fever": re.compile(r"fever\w*|temperature|high temp|chills|bukh?aa?r|बुखार|ताप"),
    "breathing": re.compile(
        r"short(?:ness)? of breath|breathless\w*|breathing (?:difficulty|problem|trouble|issue)|"
        r"difficulty (?:in )?breathing|trouble breathing|hard to breathe|can'?t breathe|wheez\w*|"
        r"saa?ns|सांस|साँस|दम फूल"
    ),
    "vomiting": re.compile(
        r"vomit\w*|throwing up|threw up|puk(?:e|ing)|ulti|उल्टी|"
        r"can'?t keep (?:anything|water|fluids?|food) down"
    ),
    "bleeding": re.compile(r"bleed\w*|blood\w*|kh?oo?n|खून|रक्त"),
    "worsening": re.compile(r"getting worse|worsen\w*|worse|increasing|badh (?:raha|rahi)|badhta|बढ़ (?:रहा|रही)|बढ़ता"),
    "chronic": re.compile(
        r"diabet\w*|sugar (?:patient|problem)|heart (?:disease|patient|problem)|asthma\w*|copd|"
        r"kidney (?:disease|failure|problem)|dialysis|cancer|chemo\w*|\bhiv\b|transplant|"
        r"immunocompromised|on steroids|शुगर|मधुमेह"
    ),
    "pregnant": re.compile(r"pregnan\w*|expecting a baby|garbh\w*|गर्भ\w*"),
    "spreading": re.compile(r"spread\w*|growing|expanding|red streak\w*|fail (?:raha|rahi)|फैल"),
}


# --- duration -------------------------------------------------------------

_NUM_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "couple of": 2, "few": 3, "several": 4, "half": 0.5,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "panch": 5,
}
_UNITS = [
    (r"min(?:ute)?s?|मिनट", 1 / 1440), (r"h(?:ou)?rs?|hours?|ghant[ea]|घंट[ेा]", 1 / 24),
    (r"days?|din|दिन", 1), (r"weeks?|wks?|haft[ea]|हफ्त[ेा]|सप्ताह", 7),
    (r"months?|mahin[ea]|महीन[ेा]", 30), (r"years?|yrs?|saal|साल|वर्ष", 365),
]
_NUM = r"(\d+(?:\.\d+)?|" + "|".join(sorted(map(re.escape, _NUM_WORDS), key=len, reverse=True)) + r")"
_DURATION_RES = [(re.compile(_NUM + r"\s*(?:-\s*)?(?:" + unit + r")\b"), days) for unit, days in _UNITS]
_RELATIVE = [
    (re.compile(r"just now|few minutes|suddenly|abhi abhi|अभी"), 0.05),
    (re.compile(r"since (?:this )?morning|since today|today|this morning|tonight|aaj|subah se|आज"), 0.3),
    (re.compile(r"since yesterday|since last night|yesterday|last night|kal se|kal raat|कल से|कल रात"), 1),
    (re.compile(r"since last week|last week|pichle hafte"), 7),
    (re.compile(r"since last month|last month|for a long time|for years|for months|chronic|long time|kaafi (?:samay|time)|बहुत समय"), 60),
]
# Ages ("3 year old", "45 saal") must not be read as durations.
_AGE_CONTEXT = re.compile(r"^\s*(?:old|-old|ka\b|ki\b|का|की|के)")


def parse_duration(text: str) -> Optional[float]:
    """Days, from the LAST duration mentioned (the latest answer wins)."""
    best: Optional[tuple[int, float]] = None
    for rx, unit_days in _DURATION_RES:
        for m in rx.finditer(text):
            if _AGE_CONTEXT.match(text[m.end():m.end() + 8]):
                continue
            raw = m.group(1)
            n = float(raw) if raw[0].isdigit() else float(_NUM_WORDS.get(raw, 1))
            if best is None or m.start() >= best[0]:
                best = (m.start(), n * unit_days)
    for rx, days in _RELATIVE:
        for m in rx.finditer(text):
            if best is None or m.start() > best[0]:
                best = (m.start(), days)
    return best[1] if best else None


def duration_band(days: Optional[float]) -> str:
    if days is None:
        return "unknown"
    if days < 1:
        return "hours"
    if days <= 3:
        return "days"
    if days <= 14:
        return "week"
    return "chronic"


# --- age ------------------------------------------------------------------

_AGE_YEARS = re.compile(
    r"(\d{1,3})\s*(?:-|\s)?(?:years?|yrs?|yo|y/o|y\.o\.|saal|साल|वर्ष)(?:\s*-?\s*old|\s+ka|\s+ki|\s+का|\s+की)?\b"
)
_AGE_STATED = re.compile(r"\b(?:age|aged|i am|i'm|im|meri umar|umar)\s*(?:is\s*)?(\d{1,3})\b(?!\s*(?:kg|cm|feet|ft|%|/))")
_AGE_MONTHS = re.compile(r"(\d{1,2})\s*(?:-|\s)?(?:months?|mahin[ea]|महीन[ेा])\s*(?:-?\s*old|ka|ki|का|की)\b")
_AGE_WORDS = [
    (re.compile(r"newborn|new born|neonate|navjaat"), 0.05), (re.compile(r"\binfant|\bbaby\b|shishu|शिशु"), 0.5),
    (re.compile(r"toddler"), 2), (re.compile(r"elderly|old (?:man|woman|lady)|grand(?:mother|father|ma|pa)|\bdadi\b|\bnani\b|\bdada\b|\bnana\b"), 72),
]
_OTHER_SUBJECT = re.compile(
    r"\bmy (?:\d+\s*(?:year|month)s?[- ]old )?(?:son|daughter|baby|child|kid|mother|father|mom|mum|dad|wife|husband|"
    r"grand\w+|brother|sister|friend|uncle|aunt|neighbou?r|boy|girl)\b|mere (?:bete|beti|bachch?e)|मेरे (?:बेटे|बेटी|बच्चे)"
)


def parse_age(text: str) -> Optional[float]:
    m = _AGE_MONTHS.search(text)
    if m:
        return int(m.group(1)) / 12
    for rx in (_AGE_YEARS, _AGE_STATED):
        m = rx.search(text)
        if m and 0 < int(m.group(1)) < 120:
            return float(m.group(1))
    for rx, age in _AGE_WORDS:
        if rx.search(text):
            return age
    return None


def age_band(age: Optional[float]) -> str:
    if age is None:
        return "unknown"
    if age < 1:
        return "infant"
    if age < 13:
        return "child"
    if age < 18:
        return "teen"
    if age < 65:
        return "adult"
    return "senior"


# --- vitals and pain ------------------------------------------------------

_TEMP = re.compile(r"(\d{2,3}(?:\.\d+)?)\s*(?:°|º|deg(?:rees?)?)?\s*(f|c|fahrenheit|celsius)\b")
_TEMP_CTX = re.compile(r"(?:temp(?:erature)?|fever|bukh?aa?r|बुखार)\s*(?:is|of|was|at|:|-|=|hai)?\s*(?:around |about )?(\d{2,3}(?:\.\d+)?)")
_HR = re.compile(r"(?:pulse|heart ?rate|\bhr\b|dhadkan)\s*(?:is|of|was|:|-|=)?\s*(\d{2,3})|(\d{2,3})\s*bpm")
_SPO2 = re.compile(r"(?:spo2|sp02|oxygen(?: level| saturation| sat)?|\bo2(?: sat\w*)?|\bsats?\b|saturation)\s*(?:is|of|was|level|:|-|=|at)?\s*(\d{2,3})\s*%?")
_BP = re.compile(r"(?:\bbp\b|blood pressure)\s*(?:is|of|was|:|-|=)?\s*(\d{2,3})\s*/\s*(\d{2,3})|(\d{2,3})\s*/\s*(\d{2,3})\s*mm\s*hg")
_RR = re.compile(r"(?:resp(?:iratory)? rate|\brr\b|breathing rate)\s*(?:is|of|:|-|=)?\s*(\d{1,2})|(\d{1,2})\s*breaths")
_PAIN_SCORE = re.compile(r"\b(\d{1,2})\s*(?:/|out of)\s*10\b")
_PAIN_SEVERE = re.compile(r"unbearable|excruciating|worst|severe pain|very (?:bad|severe|painful)|terrible|bahut (?:tez|zyada) dard|बहुत तेज़? दर्द|असहनीय")
_PAIN_MILD = re.compile(r"\bmild|slight|a little|little bit|minor|halk[aei]|हल्का")
_PAIN_ANY = re.compile(r"pain\w*|ache\w*|hurt\w*|sore|dard|दर्द|cramp\w*")


def to_celsius(v: float) -> Optional[float]:
    c = (v - 32) * 5 / 9 if v > 45 else v
    return round(c, 1) if 34 <= c <= 43.5 else None


def parse_temperature(text: str) -> Optional[float]:
    m = _TEMP.search(text)
    if m:
        v = float(m.group(1))
        return to_celsius((v - 32) * 5 / 9 if m.group(2).startswith("f") and v > 45 else v)
    m = _TEMP_CTX.search(text)
    return to_celsius(float(m.group(1))) if m else None


def _first_int(m: Optional[re.Match]) -> Optional[int]:
    if not m:
        return None
    return next((int(g) for g in m.groups() if g), None)


def parse_vitals(text: str) -> dict[str, Optional[float]]:
    hr = _first_int(_HR.search(text))
    spo2 = _first_int(_SPO2.search(text))
    rr = _first_int(_RR.search(text))
    bp = _BP.search(text)
    sbp = next((int(g) for g in bp.groups() if g), None) if bp else None
    return {
        "temp_c": parse_temperature(text),
        "heart_rate": hr if hr and 25 <= hr <= 250 else None,
        "spo2": spo2 if spo2 and 50 <= spo2 <= 100 else None,
        "sbp": sbp if sbp and 50 <= sbp <= 260 else None,
        "resp_rate": rr if rr and 4 <= rr <= 70 else None,
    }


def parse_pain(text: str) -> Optional[float]:
    m = _PAIN_SCORE.search(text)
    if m and 0 <= int(m.group(1)) <= 10:
        return float(m.group(1))
    if _PAIN_SEVERE.search(text):
        return 8.0
    if _PAIN_ANY.search(text):
        return 2.0 if _PAIN_MILD.search(text) else None
    return None


def pain_band(score: Optional[float]) -> str:
    if score is None:
        return "unknown"
    if score <= 0:
        return "none"
    if score <= 3:
        return "mild"
    if score <= 6:
        return "moderate"
    return "severe"


# --- the record -----------------------------------------------------------

@dataclass
class Features:
    text: str = ""
    age: Optional[float] = None
    duration_days: Optional[float] = None
    pain: Optional[float] = None
    temp_c: Optional[float] = None
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    sbp: Optional[float] = None
    resp_rate: Optional[float] = None
    flags: dict[str, int] = field(default_factory=lambda: {k: 0 for k in TRISTATE})
    red_flags: list[str] = field(default_factory=list)
    image_cue: Optional[str] = None  # None = no image; else one of IMAGE_CUES
    image_region: Optional[str] = None
    gender: Optional[str] = None
    asked: list[str] = field(default_factory=list)  # slots already asked, in order

    @property
    def age_band(self) -> str:
        return age_band(self.age)

    @property
    def duration_band(self) -> str:
        return duration_band(self.duration_days)

    @property
    def pain_band(self) -> str:
        return pain_band(self.pain)

    def copy(self) -> "Features":
        return copy.deepcopy(self)

    def summary(self) -> dict:
        """Compact, JSON-safe view (stored with replies + feedback, shown to the LLM)."""
        out = {
            "ageBand": self.age_band, "durationBand": self.duration_band, "painBand": self.pain_band,
            **{k: v for k, v in self.flags.items() if v},
            "redFlags": list(self.red_flags),
        }
        for k in ("temp_c", "heart_rate", "spo2", "sbp", "resp_rate"):
            v = getattr(self, k)
            if v is not None:
                out[k] = v
        if self.image_cue is not None:
            out["image"] = {"cue": self.image_cue, "region": self.image_region}
        return out


def struct_vector(f: Features) -> dict[str, float]:
    """The structured half of the model input (the other half is TF-IDF of f.text)."""
    v = {name: 0.0 for name in STRUCT_FEATURES}
    v[f"age_{f.age_band}"] = 1.0
    v[f"dur_{f.duration_band}"] = 1.0
    v[f"pain_{f.pain_band}"] = 1.0
    for k in TRISTATE:
        v[k] = float(f.flags.get(k, 0))
    if f.temp_c is not None:
        v["temp_high"] = 1.0 if f.temp_c >= 39.0 else 0.0
        v["temp_very_high"] = 1.0 if f.temp_c >= 40.0 else 0.0
    if f.heart_rate is not None:
        v["hr_high"] = 1.0 if f.heart_rate > 110 else 0.0
    if f.spo2 is not None:
        v["spo2_low"] = 1.0 if f.spo2 < 94 else 0.0
        v["spo2_critical"] = 1.0 if f.spo2 < 90 else 0.0
    if f.sbp is not None:
        v["sbp_low"] = 1.0 if f.sbp < 90 else 0.0
        v["sbp_high"] = 1.0 if f.sbp >= 180 else 0.0
    if f.resp_rate is not None:
        v["rr_high"] = 1.0 if f.resp_rate > 24 else 0.0
    v["vitals_present"] = float(any(getattr(f, k) is not None for k in ("temp_c", "heart_rate", "spo2", "sbp", "resp_rate")))
    v["rf_count"] = float(min(3, len(f.red_flags)))
    if f.image_cue is not None:
        v["img_present"] = 1.0
        if f.image_cue in ("mild", "moderate", "severe"):
            v[f"img_{f.image_cue}"] = 1.0
    return v


# --- building from a conversation ----------------------------------------

@dataclass
class Turn:
    role: str  # "user" | "assistant"
    text: str
    slot: Optional[str] = None  # assistant turns: the slot that question asked


_PROFILE_NONE = {"", "none", "no", "nil", "na", "n/a", "-"}


def build_features(
    turns: Iterable[Turn],
    *,
    profile_age: Optional[float] = None,
    profile_conditions: Optional[str] = None,
    profile_gender: Optional[str] = None,
    image_findings: Iterable[dict] = (),
) -> Features:
    """Features for the whole conversation so far. A user turn that answers a
    slot question is parsed for that slot first; free text is parsed for
    everything. Later statements override earlier ones."""
    from app.ml import slots as slot_defs  # local: slots imports this module
    from app.ml.red_flags import detect

    f = Features(gender=(profile_gender or None))
    texts: list[str] = []
    pending_slot: Optional[str] = None
    for turn in turns:
        if turn.role == "assistant":
            pending_slot = turn.slot
            if turn.slot and turn.slot not in f.asked:
                f.asked.append(turn.slot)
            continue
        if turn.role != "user":
            continue
        text = normalize(turn.text)
        if not text:
            continue
        answered = False
        if pending_slot:
            slot = slot_defs.SLOTS.get(pending_slot)
            value = slot.parse(text) if slot else None
            if value is not None:
                slot.apply(f, value)
                answered = True
        pending_slot = None
        # A bare slot answer ("yes", "3 days") adds nothing for TF-IDF.
        if not (answered and len(tokenize(text)) <= 6):
            texts.append(text)
        _absorb_free_text(f, text)

    if f.age is None and profile_age is not None and not _OTHER_SUBJECT.search(" ".join(texts)):
        f.age = profile_age
    if f.flags["chronic"] == 0 and profile_conditions and profile_conditions.strip().lower() not in _PROFILE_NONE:
        f.flags["chronic"] = 1

    image_signs: list[str] = []
    for finding in image_findings:
        if not isinstance(finding, dict):
            continue
        cue = str(finding.get("severityCue") or "none").lower()
        cue = cue if cue in IMAGE_CUES else "none"
        if f.image_cue is None or IMAGE_CUES.index(cue) > IMAGE_CUES.index(f.image_cue):
            f.image_cue = cue
            f.image_region = str(finding.get("bodyRegion") or "")[:40] or None
        for key in ("visibleSigns", "redFlags"):
            image_signs.extend(str(s) for s in (finding.get(key) or [])[:8])
    if image_signs:
        texts.append(normalize("image shows " + " ".join(image_signs)))

    f.text = " ".join(texts)
    f.red_flags = detect(f)
    return f


def _absorb_free_text(f: Features, text: str) -> None:
    for key, rx in KEYWORDS.items():
        state = find(rx, text)
        if state:
            f.flags[key] = state
    days = parse_duration(text)
    if days is not None:
        f.duration_days = days
    age = parse_age(text)
    if age is not None:
        f.age = age
    pain = parse_pain(text)
    if pain is not None:
        f.pain = pain
    for key, value in parse_vitals(text).items():
        if value is not None:
            setattr(f, key, value)
    if f.temp_c is not None and f.temp_c >= 38.0 and f.flags["fever"] == 0:
        f.flags["fever"] = 1
