"""PII scrubbing for text that leaves the chat partition (feedback store, training).

Removes what identifies a person, keeps what matters clinically: emails, URLs,
any run of 6+ digits (phone, Aadhaar, PIN code, account numbers), PAN, and a
name after "my name is" / "mera naam". Vitals ("102 F", "120/80", "SpO2 93")
survive because they are short or slash-separated. Names elsewhere in free text
cannot be found by pattern; this is documented as a known limit.
"""

from __future__ import annotations

import re

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.I)
_PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.I)
# Digits joined by at most one space or dash: 6+ of them (phone, Aadhaar, PIN).
_DIGITS = re.compile(r"(?<![\d/.])\+?\d(?:[\s-]?\d){5,}(?![\d/.])")
_NAME = re.compile(r"\b(my name is|i am called|this is|mera naam|मेरा नाम)\s+([^\W\d_][\w'-]*(?:\s+[^\W\d_][\w'-]*)?)", re.I)
_NAME_STOP = {"not", "very", "feeling", "having", "in", "a", "an", "the", "so", "too"}


def _digits(m: re.Match) -> str:
    return "[NUMBER]" if sum(c.isdigit() for c in m.group(0)) >= 6 else m.group(0)


def _name(m: re.Match) -> str:
    first = m.group(2).split()[0].lower()
    return m.group(0) if first in _NAME_STOP else f"{m.group(1)} [NAME]"


def scrub(text: str, limit: int = 2000) -> str:
    t = _EMAIL.sub("[EMAIL]", text or "")
    t = _URL.sub("[URL]", t)
    t = _PAN.sub("[ID]", t)
    t = _DIGITS.sub(_digits, t)
    t = _NAME.sub(_name, t)
    return t[:limit]
