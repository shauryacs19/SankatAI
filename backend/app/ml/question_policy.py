"""Which follow-up question to ask next, and when to stop asking.

Expected information gain over the model's severity distribution: for each
unknown, relevant slot, simulate every possible answer (weighted by its prior),
re-score, and measure the expected drop in entropy. Only structured features
change between simulations, so the text logits are computed once.

The gain is multiplied by a bandit weight in [0.5, 1.5] (Thompson sample of the
slot's Yes/No feedback), so questions people found useful are slightly preferred
without ever overriding a large information difference.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable, Optional

from app.core import config
from app.ml import red_flags
from app.ml.features import Features, struct_vector
from app.ml.severity_model import SeverityModel
from app.ml.slots import Slot, candidates

MIN_GAIN = 0.01  # nats; below this a question is not worth the user's time


def entropy(p: list[float]) -> float:
    return -sum(x * math.log(x) for x in p if x > 0)


def expected_gain(model: SeverityModel, f: Features, slot: Slot, text_logits: list[float]) -> float:
    before = entropy(model.proba_from(text_logits, struct_vector(f)))
    after = 0.0
    for value, prior in slot.values:
        g = f.copy()
        slot.apply(g, value)
        g.red_flags = red_flags.detect(g)
        after += prior * entropy(model.proba_from(text_logits, struct_vector(g)))
    return before - after


@dataclass(frozen=True)
class Choice:
    slot: Optional[Slot]  # None = stop asking
    gain: float
    reason: str  # why we stopped / why this slot (for logs + stored metadata)
    scores: dict[str, float]


def choose(
    model: SeverityModel,
    f: Features,
    confidence: float,
    *,
    weight: Callable[[str, random.Random], float] = lambda _s, _r: 1.0,
    rng: Optional[random.Random] = None,
) -> Choice:
    """Next slot to ask, or a stop decision."""
    rng = rng or random.Random(0)
    if len(f.asked) >= config.TRIAGE_MAX_QUESTIONS:
        return Choice(None, 0.0, "max_questions", {})
    if confidence >= config.TRIAGE_CONFIDENCE_THRESHOLD:
        return Choice(None, 0.0, "confident", {})
    options = candidates(f)
    if not options:
        return Choice(None, 0.0, "nothing_left_to_ask", {})
    text_logits = model.text_logits(f.text)
    gains = {s.id: expected_gain(model, f, s, text_logits) for s in options}
    scores = {sid: g * weight(sid, rng) for sid, g in gains.items()}
    best = max(options, key=lambda s: scores[s.id])
    if gains[best.id] < MIN_GAIN:
        return Choice(None, gains[best.id], "low_information", scores)
    return Choice(best, gains[best.id], "information_gain", scores)
