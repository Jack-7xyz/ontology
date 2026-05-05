"""Cash+ — staging Plus tab over `cash_data`. Adds total_compliant_weeks and discrepancy_pct."""

from __future__ import annotations

from typing import Any

WEEK_COLS = [f"week_{i}_deposit_compliance" for i in range(1, 6)]

META: dict[str, Any] = {
    "id": "cash",
    "label": "Cash+",
    "source_table": "cash_data",
    "description": "Per-store cash deposit compliance (5 weeks) and discrepancy. Adds compliance count + variance %.",
    "columns": [
        {"name": "date",                       "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store",                      "tier": "raw", "type": "TEXT", "formula": None, "description": "Store identifier."},
        {"name": "week_1_deposit_compliance",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 1 deposit compliance (1 = compliant, 0 = not)."},
        {"name": "week_2_deposit_compliance",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 2 deposit compliance."},
        {"name": "week_3_deposit_compliance",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 3 deposit compliance."},
        {"name": "week_4_deposit_compliance",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 4 deposit compliance."},
        {"name": "week_5_deposit_compliance",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 5 deposit compliance."},
        {"name": "cash_expected",              "tier": "raw", "type": "REAL", "formula": None, "description": "Expected cash deposits."},
        {"name": "cash_discrepancy",           "tier": "raw", "type": "REAL", "formula": None, "description": "Cash deposit discrepancy (signed)."},

        {"name": "total_compliant_weeks", "tier": "tab_derived", "type": "REAL", "formula": "sum(week_1..5 deposit compliance)",
         "description": "Number of weeks (0–5) where deposit compliance was met."},
        {"name": "discrepancy_pct",       "tier": "tab_derived", "type": "REAL", "formula": "abs(cash_discrepancy) / cash_expected",
         "description": "Magnitude of cash discrepancy as a share of expected deposits."},
    ],
}


def compute(conn) -> list[dict]:
    from . import safe_div

    rows = [dict(r) for r in conn.execute('SELECT * FROM "cash_data"').fetchall()]
    out: list[dict] = []
    for r in rows:
        total = sum((r.get(c) or 0) for c in WEEK_COLS) if any(r.get(c) is not None for c in WEEK_COLS) else None
        disc = r.get("cash_discrepancy")
        exp = r.get("cash_expected")
        pct = safe_div(abs(disc) if disc is not None else None, exp)
        out.append({**r, "total_compliant_weeks": total, "discrepancy_pct": pct})
    return out
