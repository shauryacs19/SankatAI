"""Training data: a public symptom dataset + synthetic triage vignettes.

Public: gretelai/symptom_to_diagnosis (Apache-2.0, 1,065 free-text symptom
descriptions -> 22 diagnoses). It has no triage labels, so each diagnosis maps
to a BASE severity and the final label is synthetic (see ``label``).

Synthetic: complaint templates (English, Hinglish, Devanagari) per severity,
including every red-flag category.

Each example draws a hidden "true" patient state (age, duration, fever,
vitals, ...) and labels it from the FULL state, but reveals only part of that
state (in the opening message or as question/answer turns). The model then
learns P(severity | what is known so far), so asking about a missing feature
really reduces its uncertainty. That is what the question policy relies on.

The labeller is a clinical heuristic, not a clinician. Feedback-derived and
reviewed labels (``feedback_data``) are how the model moves past it.
"""

from __future__ import annotations

import json
import random
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.ml import red_flags
from app.ml.features import SEVERITIES, Features, Turn, build_features

LOW, MOD, HIGH, EMR = range(4)

PUBLIC_URL = "https://huggingface.co/datasets/gretelai/symptom_to_diagnosis/resolve/main/{split}.jsonl"

DIAGNOSIS_BASE = {
    "allergy": LOW, "common cold": LOW, "fungal infection": LOW, "psoriasis": LOW, "varicose veins": LOW,
    "cervical spondylosis": LOW, "arthritis": LOW, "gastroesophageal reflux disease": LOW, "acne": LOW,
    "impetigo": MOD, "drug reaction": MOD, "chicken pox": MOD, "bronchial asthma": MOD, "hypertension": MOD,
    "diabetes": MOD, "migraine": MOD, "urinary tract infection": MOD, "peptic ulcer disease": MOD,
    "dengue": HIGH, "malaria": HIGH, "typhoid": HIGH, "pneumonia": HIGH, "jaundice": HIGH,
}

TEMPLATES: dict[int, list[str]] = {
    LOW: [
        "I have a runny nose and keep sneezing", "mild sore throat since morning", "slight headache after work",
        "small cut on my finger while cooking", "itchy bumps from mosquito bites", "acidity after spicy food",
        "mild back pain after lifting a bag", "dry itchy skin on my arms", "a pimple on my face that hurts a bit",
        "mild dry cough", "feeling a bit tired after poor sleep", "blocked nose and mild cold", "a mouth ulcer",
        "minor bruise on my knee", "mild toothache when eating sweets", "my eyes feel a little itchy",
        "constipation since yesterday", "mild muscle soreness after gym", "hiccups that keep coming back",
        "halka sar dard hai", "naak beh rahi hai aur chheenk aa rahi hai", "gale mein halki kharash hai",
        "thodi acidity ho rahi hai", "ungli pe chhota sa cut lag gaya", "हल्का सिर दर्द है", "नाक बह रही है और छींक आ रही है",
        "गले में हल्की खराश है", "no chest pain, just a mild cough", "minor scrape on my elbow, no bleeding now",
    ],
    MOD: [
        "fever and body ache", "vomiting since last night", "loose motions several times today",
        "burning while urinating", "ear pain", "twisted my ankle and it is swollen", "red painful eye with discharge",
        "throbbing headache with nausea", "cough with yellow phlegm", "rash all over with itching",
        "toothache with swollen gum", "back pain shooting down my leg", "dizzy when I stand up",
        "a boil with pus on my thigh", "stomach cramps and diarrhea", "sinus pain and pressure in my face",
        "painful swollen throat and fever", "wheezing at night", "burn on my hand from hot oil with a small blister",
        "bukhar aur badan dard hai", "kal raat se ulti ho rahi hai", "dast lag gaye hain", "peshab mein jalan hai",
        "kaan mein dard hai", "बुखार और बदन दर्द है", "उल्टी हो रही है", "पेशाब में जलन है", "पेट में मरोड़ और दस्त",
    ],
    HIGH: [
        "high fever that will not come down with paracetamol", "severe stomach pain on the right side",
        "deep cut that is gaping open", "burn with large blisters on my arm", "a dog bit my leg",
        "think I broke my arm, cannot move it", "blood in my urine", "fever with severe headache and pain behind the eyes",
        "vomiting everything, cannot keep water down", "eyes have turned yellow and urine is dark",
        "asthma attack not getting better with my inhaler", "palpitations and feel like fainting",
        "severe pain in my side going to the groin", "something hit my eye and vision is blurry",
        "fever with chills every evening and sweating", "very weak and dizzy, have not passed urine all day",
        "bahut tez bukhar hai jo utar nahi raha", "pet mein bahut tez dard ho raha hai", "kutte ne kaat liya",
        "aankhein peeli ho gayi hain", "बहुत तेज़ बुखार है जो उतर नहीं रहा", "पेट में बहुत तेज़ दर्द है",
    ],
    EMR: [
        "crushing chest pain spreading to my left arm", "chest pain with sweating and nausea",
        "his face is drooping and his speech is slurred", "I can't breathe properly", "her lips are turning blue",
        "bleeding heavily and it won't stop", "vomiting blood", "my father is unconscious and not responding",
        "my son is having a seizure", "throat is swelling after eating peanuts", "my friend swallowed pesticide",
        "took too many sleeping pills", "I want to kill myself", "a snake bit my leg",
        "severe burn on the face from a gas cylinder", "hit his head, now vomiting and confused",
        "worst headache of my life came on suddenly", "stiff neck and high fever", "I am pregnant and bleeding heavily",
        "sudden weakness on one side of my body", "seene mein bahut tez dard ho raha hai", "saans nahi aa rahi",
        "papa behosh ho gaye", "saanp ne kaat liya", "khoon band nahi ho raha", "सीने में दर्द हो रहा है",
        "सांस नहीं आ रही", "दादी बेहोश हो गईं",
    ],
}

# Red-flag cases that must ALWAYS end as EMERGENCY (model + rules). A promotion gate.
SAFETY_CASES = [
    "I have chest pain", "pain in my chest and left arm", "face drooping and slurred speech", "difficulty breathing",
    "lips turning blue", "bleeding heavily won't stop", "coughing up blood", "he passed out and is unresponsive",
    "having a seizure", "throat closing after a bee sting", "swallowed bleach", "overdose of pills",
    "I want to end my life", "snake bite on my foot", "worst headache of my life", "fever and stiff neck",
    "pregnant with heavy bleeding", "seene mein dard", "saans nahi aa rahi", "सीने में दर्द", "बेहोश हो गए",
    "my oxygen level is 85%", "BP is 80/50 and very dizzy",
]

_RESP = ("cough", "breath", "wheez", "asthma", "chest", "throat", "cold", "pneumonia", "saans", "khansi")
_SKIN = ("rash", "skin", "itch", "boil", "pimple", "burn", "blister", "bite", "cut", "psoriasis", "impetigo", "pox")
_GI = ("stomach", "vomit", "diarrh", "loose", "acid", "ulti", "dast", "pet", "abdom", "ulcer", "reflux", "jaundice")


@dataclass
class Example:
    turns: list[Turn]
    label: str
    group: str  # rows from one base complaint share a group (no split leakage)
    source: str  # public | synthetic | feedback
    weight: float = 1.0
    profile_age: Optional[float] = None
    features: Optional[Features] = None

    def build(self) -> Features:
        if self.features is None:
            self.features = build_features(self.turns, profile_age=self.profile_age)
        return self.features


# --- public data ----------------------------------------------------------

def download_public(dest: Path) -> Path:
    """Fetch train/test JSONL (data only) into ``dest``; skipped if present."""
    dest.mkdir(parents=True, exist_ok=True)
    for split in ("train", "test"):
        target = dest / f"{split}.jsonl"
        if not target.exists():
            with urllib.request.urlopen(PUBLIC_URL.format(split=split), timeout=60) as resp:  # noqa: S310 - fixed https URL
                target.write_bytes(resp.read())
    return dest


def load_public(directory: Path, split: str) -> list[tuple[str, int]]:
    rows = []
    for line in (directory / f"{split}.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        diagnosis = str(item.get("output_text", "")).strip().lower()
        text = str(item.get("input_text", "")).strip()
        if text and diagnosis in DIAGNOSIS_BASE:
            rows.append((text, DIAGNOSIS_BASE[diagnosis]))
    return rows


# --- hidden state, labeller, reveal --------------------------------------

def _has(text: str, words: tuple[str, ...]) -> bool:
    t = text.lower()
    return any(w in t for w in words)


def sample_state(rng: random.Random, complaint: str, base: int) -> Features:
    """A plausible full patient state for this complaint."""
    f = Features(text=complaint.lower())
    f.age = rng.choices([0.15, 0.6, 4, 9, 15, 25, 38, 52, 70, 81], weights=[2, 3, 5, 5, 6, 18, 18, 14, 10, 5])[0]
    f.duration_days = rng.choices([0.1, 0.4, 1, 2, 3, 6, 10, 30], weights=[8, 10, 14, 14, 10, 8, 5, 6])[0]
    p_fever = {LOW: 0.12, MOD: 0.45, HIGH: 0.6, EMR: 0.25}[base]
    if _has(complaint, ("fever", "bukhar", "बुखार", "dengue", "malaria", "typhoid")):
        p_fever = 0.95
    f.flags["fever"] = 1 if rng.random() < p_fever else -1
    if f.flags["fever"] == 1:
        temps, weights = ([37.9, 38.3, 38.8, 39.2, 39.6, 40.1, 40.6], [3, 5, 5, 4, 2, 1, 0.5]) if base >= MOD \
            else ([37.8, 38.1, 38.4, 38.9], [4, 4, 3, 1])
        f.temp_c = rng.choices(temps, weights=weights)[0]
    resp = _has(complaint, _RESP)
    f.flags["breathing"] = 1 if rng.random() < (0.35 if resp else 0.06) * (1.6 if base >= HIGH else 1) else -1
    gi = _has(complaint, _GI)
    f.flags["vomiting"] = 1 if rng.random() < (0.5 if gi else 0.1) else -1
    f.flags["worsening"] = 1 if rng.random() < {LOW: 0.12, MOD: 0.3, HIGH: 0.5, EMR: 0.6}[base] else -1
    f.flags["chronic"] = 1 if rng.random() < (0.35 if f.age and f.age > 50 else 0.1) else -1
    f.flags["spreading"] = 1 if _has(complaint, _SKIN) and rng.random() < 0.35 else -1
    f.flags["bleeding"] = 1 if _has(complaint, ("cut", "bleed", "blood", "wound")) and rng.random() < 0.6 else -1
    f.pain = float(rng.choice({LOW: [0, 1, 2, 3, 4], MOD: [2, 3, 4, 5, 6, 7], HIGH: [5, 6, 7, 8, 9], EMR: [6, 8, 9, 10]}[base]))
    if rng.random() < 0.08:
        f.spo2 = rng.choice([88, 92, 95, 97, 98])
    if rng.random() < 0.06:
        f.heart_rate = rng.choice([72, 96, 118, 130])
    return f


def label(base: int, f: Features) -> int:
    """Clinical heuristic over the FULL state. Never below the red-flag floor."""
    s = base
    fever, breath, vomit = f.flags["fever"] == 1, f.flags["breathing"] == 1, f.flags["vomiting"] == 1
    worse, chronic = f.flags["worsening"] == 1, f.flags["chronic"] == 1
    infant = f.age is not None and f.age < 1
    elderly = f.age is not None and f.age >= 65
    pain = f.pain if f.pain is not None else 0
    days = f.duration_days or 0

    if f.temp_c is not None and f.temp_c >= 40:
        s = max(s, HIGH)
    if fever:
        s = max(s, MOD)
        if days > 7:
            s = max(s, HIGH)  # fever beyond a week needs an urgent check-up
    if breath:
        s = max(s, MOD)
        if fever or chronic or infant or elderly:
            s = max(s, HIGH)
    if vomit:
        s = max(s, MOD)
        if infant or (days >= 2 and elderly):
            s = max(s, HIGH)
    if pain >= 9 or (pain >= 7 and worse):
        s = max(s, HIGH)
    elif pain >= 7:
        s = max(s, MOD)
    if worse and s == MOD and chronic:
        s = HIGH
    if infant:
        s = max(s, MOD)
        if fever or vomit or breath:
            s = max(s, HIGH)
    if elderly and s == MOD and (fever or breath):
        s = HIGH
    if f.flags["spreading"] == 1:
        s = max(s, MOD)
        if fever:
            s = max(s, HIGH)
    if f.spo2 is not None and f.spo2 < 94:
        s = max(s, HIGH)
    if f.heart_rate is not None and f.heart_rate > 110 and fever:
        s = max(s, HIGH)
    # Mild, short, stable, no warning signs: a moderate complaint is self-care.
    if s == MOD and base == MOD and pain <= 3 and not (fever or breath or vomit or worse) and days <= 3 and not infant:
        s = LOW
    f.red_flags = red_flags.detect(f)
    floor_level, _ = red_flags.floor(f)
    if floor_level is not None:
        s = max(s, SEVERITIES.index(floor_level))
    return s


_REL = ["son", "daughter", "mother", "father", "husband", "wife", "grandmother"]


def _age_sentence(rng: random.Random, age: float) -> str:
    if age < 1:
        return f"My baby is {max(1, round(age * 12))} months old."
    if age < 18:
        return rng.choice([f"My {int(age)} year old {rng.choice(['son', 'daughter'])} has this.", f"Child is {int(age)} years old."])
    return rng.choice([f"I am {int(age)} years old.", f"My {rng.choice(_REL)} is {int(age)} years old.", f"meri umar {int(age)} saal hai.", f"age {int(age)}"])


def _duration_sentence(rng: random.Random, days: float) -> str:
    if days < 1:
        return rng.choice([f"It started {max(1, round(days * 24))} hours ago.", "since this morning", "aaj subah se"])
    if days < 2:
        return rng.choice(["since yesterday", "kal se", "for 1 day"])
    if days < 14:
        return rng.choice([f"for {int(days)} days", f"{int(days)} din se", f"since {int(days)} days"])
    return rng.choice([f"for {int(days // 7)} weeks", f"for {max(1, int(days // 30))} months", "for a long time"])


def _flag_sentence(rng: random.Random, key: str, value: int) -> str:
    yes = {
        "fever": ["I also have fever.", "bukhar bhi hai.", "feeling feverish"],
        "breathing": ["I feel short of breath.", "a bit breathless", "saans phool rahi hai"],
        "vomiting": ["I have been vomiting.", "ulti bhi ho rahi hai"],
        "worsening": ["It is getting worse.", "badh raha hai"],
        "chronic": ["I have diabetes.", "I am a heart patient.", "I have asthma."],
        "spreading": ["It is spreading.", "fail raha hai"],
        "bleeding": ["There is some bleeding."],
    }[key]
    no = {
        "fever": ["No fever.", "bukhar nahi hai"], "breathing": ["No breathing problem."], "vomiting": ["No vomiting."],
        "worsening": ["It is not getting worse."], "chronic": ["I don't have diabetes or heart disease."],
        "spreading": ["It is not spreading."], "bleeding": ["No bleeding."],
    }[key]
    return rng.choice(yes if value == 1 else no)


def _answer(rng: random.Random, slot: str, f: Features) -> Optional[str]:
    if slot in ("fever", "breathing", "vomiting", "worsening", "chronic", "spreading", "bleeding"):
        v = f.flags[slot]
        return rng.choice(["yes", "yes, a little", "haan", "ji haan", "हाँ"]) if v == 1 else rng.choice(["no", "nahi", "no, not at all", "नहीं"])
    if slot == "duration":
        return _duration_sentence(rng, f.duration_days)
    if slot == "age":
        return rng.choice([f"{int(f.age)}", f"{int(f.age)} years"]) if f.age >= 1 else f"{max(1, round(f.age * 12))} months old"
    if slot == "pain":
        return rng.choice([f"{int(f.pain)}", f"{int(f.pain)}/10"])
    if slot == "temperature" and f.temp_c is not None:
        return rng.choice([f"{round(f.temp_c * 9 / 5 + 32, 1)}", f"{f.temp_c} C"])
    return None


_REVEALABLE = ("age", "duration", "pain", "fever", "temperature", "breathing", "vomiting", "worsening", "chronic", "spreading", "bleeding")


def reveal(rng: random.Random, complaint: str, f: Features, p_reveal: float) -> tuple[list[Turn], Optional[float]]:
    """Turns that disclose part of the state: some in the opener, some as Q&A."""
    opener = [complaint]
    qa: list[Turn] = []
    profile_age = None
    for key in _REVEALABLE:
        if rng.random() >= p_reveal:
            continue
        if key == "temperature" and f.temp_c is None:
            continue
        if key == "age" and f.age >= 18 and rng.random() < 0.3:
            profile_age = f.age  # known from the signed-in profile
            continue
        if rng.random() < 0.5:  # said up front
            if key == "age":
                opener.append(_age_sentence(rng, f.age))
            elif key == "duration":
                opener.append(_duration_sentence(rng, f.duration_days))
            elif key == "pain":
                opener.append(f"Pain is {int(f.pain)}/10." if f.pain else "No pain.")
            elif key == "temperature":
                opener.append(f"Temperature is {round(f.temp_c * 9 / 5 + 32, 1)} F.")
            else:
                opener.append(_flag_sentence(rng, key, f.flags[key]))
        else:  # asked by the assistant
            answer = _answer(rng, key, f)
            if answer:
                qa += [Turn("assistant", "?", slot=key), Turn("user", answer)]
    if f.spo2 is not None and rng.random() < 0.7:
        opener.append(f"My oxygen level is {f.spo2}%.")
    if f.heart_rate is not None and rng.random() < 0.7:
        opener.append(f"Pulse is {f.heart_rate}.")
    head, *rest = opener
    rng.shuffle(rest)
    return [Turn("user", " ".join([head, *rest]))] + qa, profile_age


def _examples_for(rng: random.Random, complaint: str, base: int, group: str, source: str, n: int) -> list[Example]:
    out = []
    for _ in range(n):
        state = sample_state(rng, complaint, base)
        y = label(base, state)
        p = rng.choice([0.0, 0.2, 0.4, 0.6, 0.9])
        turns, profile_age = reveal(rng, complaint, state, p)
        out.append(Example(turns, SEVERITIES[y], group, source, profile_age=profile_age))
    return out


def build_dataset(public_dir: Optional[Path], seed: int = 42, per_public: int = 3, per_template: int = 14) -> list[Example]:
    rng = random.Random(seed)
    rows: list[Example] = []
    if public_dir is not None:
        for split in ("train", "test"):
            for i, (text, base) in enumerate(load_public(public_dir, split)):
                rows += _examples_for(rng, text, base, f"public-{split}-{i}", "public", per_public)
    for base, items in TEMPLATES.items():
        for i, text in enumerate(items):
            rows += _examples_for(rng, text, base, f"tpl-{base}-{i}", "synthetic", per_template)
    return rows


def safety_examples() -> list[Example]:
    return [Example([Turn("user", t)], "EMERGENCY", f"safety-{i}", "safety") for i, t in enumerate(SAFETY_CASES)]
