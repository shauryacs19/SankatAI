"""Thompson-sampling bandit over prompt variants and follow-up question slots.

Arms: ``prompt#<variant>`` and ``slot#<slot id>``; each keeps Yes/No counts from
the feedback store. Counts are cached in-process for BANDIT_CACHE_SECONDS, and
any store failure degrades to uniform priors (never an error on the chat path).
"""

from __future__ import annotations

import logging
import random
import threading
import time
from typing import Iterable, Optional

from app.core import config
from app.repositories import feedback_repository as repo

logger = logging.getLogger("sankatai")

_lock = threading.Lock()
_counts: dict[str, tuple[int, int]] = {}
_loaded_at: Optional[float] = None


def counts() -> dict[str, tuple[int, int]]:
    global _counts, _loaded_at
    now = time.monotonic()
    if _loaded_at is not None and now - _loaded_at < config.BANDIT_CACHE_SECONDS:
        return _counts
    with _lock:
        if _loaded_at is None or now - _loaded_at >= config.BANDIT_CACHE_SECONDS:
            _loaded_at = now
            if repo.enabled():
                try:
                    _counts = repo.read_counts()
                except Exception as err:  # noqa: BLE001 - bandit is best-effort
                    logger.warning("Bandit counts unavailable (%s); using uniform priors.", type(err).__name__)
    return _counts


def sample(arm: str, rng: random.Random) -> float:
    yes, no = counts().get(arm, (0, 0))
    return rng.betavariate(1 + yes, 1 + no)


def pick(variants: Iterable[str], rng: random.Random) -> str:
    options = list(variants)
    return max(options, key=lambda v: sample(f"prompt#{v}", rng))


def slot_weight(slot_id: str, rng: random.Random) -> float:
    """0.5..1.5 multiplier on a slot's information gain."""
    return 0.5 + sample(f"slot#{slot_id}", rng)


def record(arms: Iterable[str], old: Optional[str], new: Optional[str]) -> None:
    """Move each arm's standing vote from ``old`` to ``new`` ("yes" | "no" | None)."""
    if old == new or not repo.enabled():
        return
    for arm in set(arms):
        delta = {"yes": 0, "no": 0}
        if old in delta:
            delta[old] -= 1
        if new in delta:
            delta[new] += 1
        repo.add_counts(arm, **delta)


def reset_for_tests(data: Optional[dict] = None) -> None:
    global _counts, _loaded_at
    _counts, _loaded_at = dict(data or {}), (time.monotonic() if data is not None else None)
