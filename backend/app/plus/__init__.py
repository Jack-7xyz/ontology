"""Plus tabs — staging layer (1 Plus per Source). Each Plus tab = source columns + derived metrics.

Architecture:
  Source (raw xlsx) → Plus (staging, 1:1 per source) → BI Dashboards (Phase 5+) → Mechanics → Utility

Each module exports:
  - META: dict with id, label, source_table, columns[]. columns[] preserves Jack's spec order:
    raw source columns first, then tab_derived columns. Each column dict carries
    {name, tier, formula, description, type}. Tier ∈ {raw, tab_derived}.
  - compute(conn) → list[dict]: pure function over Source rows producing the Plus rows.

No materialization — compute on every request. 120 rows × 10 tabs = microseconds.
"""

from __future__ import annotations

from typing import Any, Callable

from . import (
    cash,
    dropship,
    hg,
    inventory,
    payroll,
    staff,
    staff_hours,
    store,
    visual,
    voc,
)

# Registry: id → module. Order matches Jack's spec list (Store first, Cash last).
REGISTRY: dict[str, Any] = {
    "store": store,
    "staff": staff,
    "staff_hours": staff_hours,
    "visual": visual,
    "voc": voc,
    "payroll": payroll,
    "inventory": inventory,
    "hg": hg,
    "dropship": dropship,
    "cash": cash,
}


def list_plus_ids() -> list[str]:
    return list(REGISTRY.keys())


def get_meta(plus_id: str) -> dict:
    return REGISTRY[plus_id].META


def compute(plus_id: str, conn) -> list[dict]:
    return REGISTRY[plus_id].compute(conn)


# ---- shared helpers ----

def safe_div(num: float | None, den: float | None) -> float | None:
    """Return num/den or None if den is falsy/None or num is None."""
    if num is None or den is None or den == 0:
        return None
    return num / den


def percentile(values: list[float], pct: float) -> float | None:
    """Linear-interpolated percentile (0..100). None if values empty."""
    vs = sorted(v for v in values if v is not None)
    if not vs:
        return None
    if len(vs) == 1:
        return vs[0]
    k = (len(vs) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(vs) - 1)
    if f == c:
        return vs[f]
    return vs[f] + (vs[c] - vs[f]) * (k - f)
