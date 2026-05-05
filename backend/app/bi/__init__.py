"""BI dashboards — composed from Plus tabs. Each dashboard is a curated view that joins
one or more Plus tabs and produces BI-derived metrics with conditional G/Y/R coloring.

Architecture:
  Source → Plus (staging, 1:1) → **BI Dashboards** → Mechanics → Utility

Each module exports:
  - META: {id, label, description, upstream_plus[], columns[], takeaways[]}
    columns[] each: {name, tier, type, formula, description, flag_rule?}
    flag_rule: None | dict describing how to bucket the cell into green/yellow/red.
  - compute(conn) → {rows: [...], flags: [{col: "green"/"yellow"/"red"/None, ...}, ...]}
    Rows and flags are parallel arrays (flag[i] corresponds to row[i]).

Flag evaluation happens server-side — the frontend just renders coloured chips.
META.columns[i].flag_rule carries the human-readable rule so the right panel can show
"Return %: green <P33 · yellow P33-P67 · red >P67" without duplicating logic.

Flag rule schema
----------------
  flag_rule = {
    "kind": "threshold" | "percentile" | "categorical" | "none" | "mirror",
    "legend": "<human summary>",

    # kind=mirror: color copied from another column's flag. Useful when a raw
    # metric column is displayed alongside its normalized/ratio sibling and they
    # should share the same G/Y/R (e.g. Sales/Hour mirrors S/Hr vs Store).
    # Evaluator returns None; BI modules apply the copy in their compute() pass.
    "source": "<col_name>",

    # kind=threshold:
    "bands": [  # evaluated top-to-bottom, first match wins
      {"color": "green"|"yellow"|"red",
       "op":    ">"|">="|"<"|"<="|"=="|"between"
             |  "abs_gt"|"abs_gte"|"abs_lt"|"abs_lte"|"abs_between"
             |  "none",
       "value": <number> | [lo, hi] | <str>},
      ...
    ],

    # kind=none: explicitly "no G/Y/R" — UI renders rationale only.

    # Optional (all kinds):
    "rationale": "<1-2 sentence why — from deck/sheet or DB-verified stats>",

    # kind=percentile:
    "direction":  "higher_is_better" | "lower_is_better",
    "cut_low":    0.33,  # default
    "cut_high":   0.67,  # default

    # kind=categorical:
    "mapping": {"<value>": "green"|"yellow"|"red", ...},
  }
"""

from __future__ import annotations

from typing import Any

from . import (
    store_intel,
    ops_compliance,
    associate_perf,
    attribution_intel,
    fine_mix_intel,
    hg_intel,
    improvements,
)

# Order here drives LeftNav + RightPanel BI list ordering. Locked per phase-4 plan:
# Store → Ops → Associate → Attribution → Fine-Mix → HG.
REGISTRY: dict[str, Any] = {
    "store_intel":       store_intel,
    "ops_compliance":    ops_compliance,
    "associate_perf":    associate_perf,
    "attribution_intel": attribution_intel,
    "fine_mix_intel":    fine_mix_intel,
    "hg_intel":          hg_intel,
}


def list_bi_ids() -> list[str]:
    return list(REGISTRY.keys())


def get_meta(bi_id: str) -> dict:
    """Return the BI's META with Ontology Improvements injected from the catalog.
    Shallow copy — we don't mutate the module-level META constant."""
    return {
        **REGISTRY[bi_id].META,
        "ontology_improvements": improvements.improvements_for(bi_id),
    }


# Fail fast at import time if any catalog bi_id references an unknown BI.
_cat_issues = improvements.validate_against_registry(list(REGISTRY.keys()))
if _cat_issues:
    raise RuntimeError(f"ontology_improvements catalog ↔ BI registry drift: {_cat_issues}")


def compute(bi_id: str, conn) -> dict:
    """Returns {rows: [...], flags: [{col_name: color|None}, ...]}."""
    return REGISTRY[bi_id].compute(conn)


# ---------- shared helpers ----------

def safe_div(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return num / den


def percentile(values: list[float], pct: float) -> float | None:
    """Linear-interpolated percentile (0..1). None if empty."""
    vs = sorted(v for v in values if v is not None)
    if not vs:
        return None
    if len(vs) == 1:
        return vs[0]
    k = (len(vs) - 1) * pct
    f = int(k)
    c = min(f + 1, len(vs) - 1)
    if f == c:
        return vs[f]
    return vs[f] + (vs[c] - vs[f]) * (k - f)


def evaluate_flag(value: Any, rule: dict | None, all_values: list[Any] | None = None) -> str | None:
    """Return 'green'|'yellow'|'red' or None. `all_values` required for percentile rules."""
    if rule is None or value is None:
        return None
    kind = rule["kind"]

    if kind == "threshold":
        for band in rule["bands"]:
            if _match_band(value, band["op"], band["value"]):
                return band["color"]
        return None

    if kind == "percentile":
        if not all_values:
            return None
        cut_low = rule.get("cut_low", 0.33)
        cut_high = rule.get("cut_high", 0.67)
        p_low = percentile([v for v in all_values if v is not None], cut_low)
        p_high = percentile([v for v in all_values if v is not None], cut_high)
        if p_low is None or p_high is None:
            return None
        higher_better = rule["direction"] == "higher_is_better"
        if value > p_high:
            return "green" if higher_better else "red"
        if value < p_low:
            return "red" if higher_better else "green"
        return "yellow"

    if kind == "categorical":
        m = rule.get("mapping", {})
        return m.get(str(value))

    return None


def _match_band(value: Any, op: str, target: Any) -> bool:
    if op == "none":
        return False
    try:
        if op == "between":
            lo, hi = target
            return lo <= value <= hi
        if op == ">":
            return value > target
        if op == ">=":
            return value >= target
        if op == "<":
            return value < target
        if op == "<=":
            return value <= target
        if op == "==":
            return value == target
        # Absolute-value variants — used when sign direction is irrelevant
        # (Attr Gap, Inventory Variance: both over- and under- count equally).
        if op == "abs_gt":
            return abs(value) > target
        if op == "abs_gte":
            return abs(value) >= target
        if op == "abs_lt":
            return abs(value) < target
        if op == "abs_lte":
            return abs(value) <= target
        if op == "abs_between":
            lo, hi = target
            return lo <= abs(value) <= hi
    except (TypeError, ValueError):
        return False
    return False


def compute_flags_for_column(col_name: str, rule: dict | None, rows: list[dict]) -> list[str | None]:
    """Evaluate `rule` against each row's `col_name` value, returning parallel color list."""
    if rule is None:
        return [None] * len(rows)
    all_values = [r.get(col_name) for r in rows] if rule.get("kind") == "percentile" else None
    return [evaluate_flag(r.get(col_name), rule, all_values) for r in rows]
