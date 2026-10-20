"""Rule-based red flags: the safety layer above the severity model.

Each rule sets a FLOOR. EMERGENCY rules force EMERGENCY no matter what the
model says (it can never downgrade them); HIGH rules guarantee at least HIGH.
The model may still raise any result. Patterns cover English, Hinglish and
Devanagari, and an explicitly negated mention ("no chest pain", "seene mein
dard nahi") does not fire.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from app.ml.features import SEVERITIES, find

if TYPE_CHECKING:  # pragma: no cover
    from app.ml.features import Features


@dataclass(frozen=True)
class Rule:
    id: str
    level: str  # "EMERGENCY" | "HIGH"
    label: str  # plain-language reason, shown to the LLM and stored with feedback
    pattern: Optional[re.Pattern] = None


def _rx(p: str) -> re.Pattern:
    return re.compile(p)


TEXT_RULES: tuple[Rule, ...] = (
    Rule("chest_pain", "EMERGENCY", "chest pain or pressure",
         _rx(r"chest (?:pain|tightness|pressure|heaviness|discomfort)|pain in (?:my |the )?chest|heart attack|"
             r"seen[ea] (?:me|mein|mai) (?:dard|bhaari\w*)|chh?aa?ti (?:me|mein|mai) dard|सीने में (?:दर्द|भारीपन)|छाती में दर्द")),
    Rule("stroke", "EMERGENCY", "possible stroke signs",
         _rx(r"face (?:is )?droop\w*|drooping (?:face|mouth|eyelid)|slurr\w* (?:speech|words)|can'?t (?:speak|talk) properly|"
             r"sudden (?:weakness|numbness|confusion|vision loss|blindness)|one side of (?:my |his |her |the )?(?:body|face) "
             r"(?:is )?(?:weak|numb|paraly\w*)|\bstroke\b|lakwa|लकवा|मुंह टेढ़ा")),
    Rule("breathing", "EMERGENCY", "difficulty breathing",
         _rx(r"can'?t breathe|cannot breathe|unable to breathe|struggling to breathe|difficulty (?:in )?breathing|"
             r"trouble breathing|hard to breathe|gasping|chok(?:ing|ed)|lips (?:are |turning )?blue|blue lips|"
             r"breathless (?:at|while) rest|saa?ns (?:nahi|nhi|nahin) (?:aa|le) (?:rahi|raha|pa)|सांस नहीं|दम घुट")),
    Rule("heavy_bleeding", "EMERGENCY", "heavy or uncontrolled bleeding",
         _rx(r"heavy bleeding|bleeding (?:heavily|a lot|profusely|badly|won'?t stop|wont stop|not stopping|non ?stop)|"
             r"won'?t stop bleeding|spurting|lots of blood|pool of blood|soak\w* (?:through|with blood)|"
             r"vomit\w* blood|blood in (?:my )?vomit|cough\w* (?:up )?blood|black tarry stool|"
             r"kh?oo?n (?:band nahi|ruk nahi|bahut)|बहुत खून|खून (?:बंद नहीं|रुक नहीं)")),
    Rule("unconscious", "EMERGENCY", "unconscious or unresponsive",
         _rx(r"unconscious|not responding|unresponsive|collapsed|won'?t wake|can'?t wake|behosh|बेहोश")),
    Rule("seizure", "EMERGENCY", "seizure",
         _rx(r"seizure\w*|convuls\w*|having (?:a )?fits?\b|(?:got|had) a fit\b|fits? aa|mirgi|दौरा|मिर्गी")),
    Rule("anaphylaxis", "EMERGENCY", "severe allergic reaction",
         _rx(r"throat (?:is )?(?:closing|swelling|tight)|swollen (?:tongue|lips|throat)|tongue (?:is )?swell\w*|anaphyla\w*")),
    Rule("poisoning", "EMERGENCY", "poisoning or overdose",
         _rx(r"overdos\w*|poison\w*|swallowed (?:bleach|acid|pesticide|kerosene|chemicals?|pills|tablets)|"
             r"too many (?:pills|tablets)|zeh(?:e)?r|ज़हर|जहर")),
    Rule("self_harm", "EMERGENCY", "risk of self-harm",
         _rx(r"suicid\w*|kill (?:my ?self|myself)|end (?:my|it) (?:life|all)|self[- ]?harm|want to die|"
             r"marna chaht[aei]|khudkushi|आत्महत्या|मरना चाहत")),
    Rule("severe_burn", "EMERGENCY", "severe burn",
         _rx(r"(?:severe|major|large|deep|third[- ]degree|electrical|chemical) burns?|burns? (?:on|over) (?:the )?(?:face|whole|entire|large)")),
    Rule("snake_bite", "EMERGENCY", "snake bite",
         _rx(r"snake ?bit\w*|bitten by a snake|saa?n?p ne kaa?t\w*|साँप|सांप")),
    Rule("head_injury", "EMERGENCY", "head injury with warning signs",
         _rx(r"(?:head injury|hit (?:my|his|her|their) head|fell on (?:my|his|her) head).{0,60}(?:vomit|faint|confus|unconscious|sleepy|drows)")),
    Rule("meningitis", "EMERGENCY", "fever with stiff neck",
         _rx(r"stiff neck.{0,40}fever|fever.{0,40}stiff neck|non[- ]blanching rash|rash (?:that )?doesn'?t fade")),
    Rule("thunderclap", "EMERGENCY", "sudden worst-ever headache",
         _rx(r"worst headache|thunderclap|sudden (?:severe|terrible|explosive) headache")),
    Rule("pregnancy_bleeding", "EMERGENCY", "bleeding or severe pain in pregnancy",
         _rx(r"pregnan\w*.{0,60}(?:bleed|severe pain|water broke|no movement)|(?:bleed\w*|severe pain).{0,40}pregnan\w*")),
    Rule("fainting", "HIGH", "fainting",
         _rx(r"fainted|passed out|blacked out|fainting (?:spells?|episodes?)")),
    Rule("severe_abdominal", "HIGH", "severe abdominal pain",
         _rx(r"severe (?:stomach|abdominal|belly) pain|(?:stomach|abdominal|belly) pain (?:is )?(?:severe|unbearable)|pet me(?:in)? (?:bahut )?tez dard")),
    Rule("fracture", "HIGH", "possible fracture or dislocation",
         _rx(r"broken (?:bone|arm|leg|wrist|ankle)|fractur\w*|bone (?:is )?(?:sticking|visible)|can'?t (?:move|bear weight)|dislocat\w*")),
    Rule("animal_bite", "HIGH", "animal bite (rabies risk)",
         _rx(r"(?:dog|cat|monkey|bat|animal) (?:bite|bit me|scratch)|bitten by a (?:dog|cat|monkey|bat)|kutt[ae] ne kaa?t\w*|कुत्ते ने काटा")),
    Rule("blood_in_urine_stool", "HIGH", "blood in urine or stool",
         _rx(r"blood in (?:my )?(?:urine|pee|stool|poo)|bloody (?:urine|stool|diarrh\w*)")),
)


def _vital_rules(f: "Features") -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    if f.spo2 is not None and f.spo2 < 90:
        out.append(("low_oxygen", "EMERGENCY", "oxygen saturation below 90%"))
    elif f.spo2 is not None and f.spo2 < 94:
        out.append(("low_oxygen", "HIGH", "oxygen saturation below 94%"))
    if f.sbp is not None and f.sbp < 90:
        out.append(("low_bp", "EMERGENCY", "very low blood pressure"))
    if f.sbp is not None and f.sbp >= 180:
        out.append(("high_bp", "HIGH", "very high blood pressure"))
    if f.heart_rate is not None and (f.heart_rate > 140 or f.heart_rate < 40):
        out.append(("heart_rate", "EMERGENCY", "dangerous heart rate"))
    if f.resp_rate is not None and f.resp_rate > 30:
        out.append(("resp_rate", "EMERGENCY", "very fast breathing"))
    if f.temp_c is not None and f.temp_c >= 41:
        out.append(("hyperthermia", "EMERGENCY", "temperature 41 °C / 106 °F or higher"))
    elif f.temp_c is not None and f.temp_c >= 40:
        out.append(("high_fever", "HIGH", "temperature 40 °C / 104 °F or higher"))
    # Age-specific: fever in a baby under 3 months is always an emergency.
    if f.age is not None and f.age < 0.25 and f.flags.get("fever") == 1:
        out.append(("infant_fever", "EMERGENCY", "fever in a baby under 3 months"))
    elif f.age is not None and f.age < 1 and f.flags.get("fever") == 1:
        out.append(("infant_fever", "HIGH", "fever in a baby under 1 year"))
    if f.flags.get("pregnant") == 1 and f.flags.get("bleeding") == 1:
        out.append(("pregnancy_bleeding", "EMERGENCY", "bleeding in pregnancy"))
    if f.image_cue == "severe":
        out.append(("image_severe", "HIGH", "photo shows severe findings"))
    return out


_LABELS = {r.id: r.label for r in TEXT_RULES}
_LEVELS = {r.id: r.level for r in TEXT_RULES}


def detect(f: "Features") -> list[str]:
    """Ids of the red flags present (text + vitals + age), de-duplicated."""
    found: list[str] = []
    for rule in TEXT_RULES:
        if rule.pattern is not None and find(rule.pattern, f.text) == 1:
            found.append(rule.id)
    for rid, _level, _label in _vital_rules(f):
        if rid not in found:
            found.append(rid)
    return found


def _rule_info(f: "Features", rid: str) -> tuple[str, str]:
    """(level, label) of one red flag; vital/age rules are re-evaluated on f."""
    for vid, level, label in _vital_rules(f):
        if vid == rid:
            return level, label
    return _LEVELS.get(rid, "HIGH"), _LABELS.get(rid, rid)


def floor(f: "Features") -> tuple[Optional[str], list[str]]:
    """(minimum severity, reasons) the rules require, or (None, []) without flags."""
    if not f.red_flags:
        return None, []
    info = [_rule_info(f, rid) for rid in f.red_flags]
    worst = max((lvl for lvl, _ in info), key=SEVERITIES.index)
    reasons = [label for lvl, label in info if lvl == worst]
    return worst, reasons


def apply_floor(model_severity: str, f: "Features") -> tuple[str, str, list[str]]:
    """Combine model + rules: ``(severity, source, reasons)``. The result is never
    below the rule floor; an EMERGENCY floor always wins (source="rules")."""
    rule_level, reasons = floor(f)
    if rule_level is None:
        return model_severity, "model", []
    if SEVERITIES.index(rule_level) >= SEVERITIES.index(model_severity):
        return rule_level, "rules", reasons
    return model_severity, "model", reasons


def is_self_harm(f: "Features") -> bool:
    return "self_harm" in f.red_flags
