"""Per-process in-memory rate limiter — localhost dev only.

20 requests per 60-second rolling window, keyed by client IP. The ontology is
single-user localhost so this is mostly a runaway-script guard, not a security
layer. Sliding window via a deque of timestamps per key.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Deque

DEFAULT_LIMIT = 20
DEFAULT_WINDOW_SEC = 60.0


class RateLimiter:
    def __init__(self, limit: int = DEFAULT_LIMIT, window_sec: float = DEFAULT_WINDOW_SEC) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self._hits: dict[str, Deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str, now: float | None = None) -> tuple[bool, int]:
        """Return (allowed, retry_after_sec). Records a hit if allowed."""
        now = now if now is not None else time.monotonic()
        cutoff = now - self.window_sec
        with self._lock:
            dq = self._hits.setdefault(key, deque())
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.limit:
                retry_after = max(1, int(self.window_sec - (now - dq[0])) + 1)
                return False, retry_after
            dq.append(now)
            return True, 0


_default = RateLimiter()


def check(key: str) -> tuple[bool, int]:
    return _default.check(key)
