"""Per-user sliding-window rate limiter (in-process).

The backend runs one uvicorn worker per instance, so a process-local counter is
exact there; more workers or instances would each allow the full quota.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Callable, Optional

_PRUNE_ABOVE = 10_000  # tracked users before stale entries are swept


class SlidingWindowLimiter:
    def __init__(self, limit: Callable[[], int], window_seconds: float = 60.0):
        # `limit` is read on every call so tests/config changes apply immediately.
        self._limit = limit
        self._window = window_seconds
        self._recent: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            if len(self._recent) > _PRUNE_ABOVE:
                for k in [k for k, q in self._recent.items() if not q or now - q[-1] >= self._window]:
                    del self._recent[k]
            issued = self._recent.setdefault(key, deque())
            while issued and now - issued[0] >= self._window:
                issued.popleft()
            if len(issued) >= self._limit():
                return False
            issued.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._recent.clear()
