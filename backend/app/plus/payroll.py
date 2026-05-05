"""Payroll+ — staging Plus tab over `payroll_data` source. Adds avg_budget_pct and max_week_pct.

Note: source values are whole numbers (e.g. 115) representing percent (115%). We do not divide
by 100 — UI renders them as percentages.
"""

from __future__ import annotations

from typing import Any

WEEK_COLS = [f"payroll_budget_week_{i}" for i in range(1, 6)]

META: dict[str, Any] = {
    "id": "payroll",
    "label": "Payroll+",
    "source_table": "payroll_data",
    "description": "Per-store weekly payroll-budget % (5 weeks). Adds period average and the worst week.",
    "columns": [
        {"name": "date",                   "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",         "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "payroll_budget_week_1",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 1 payroll budget % (whole number — 115 = 115%)."},
        {"name": "payroll_budget_week_2",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 2 payroll budget %."},
        {"name": "payroll_budget_week_3",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 3 payroll budget %."},
        {"name": "payroll_budget_week_4",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 4 payroll budget %."},
        {"name": "payroll_budget_week_5",  "tier": "raw", "type": "REAL", "formula": None, "description": "Week 5 payroll budget %."},

        {"name": "avg_budget_pct", "tier": "tab_derived", "type": "REAL", "formula": "mean(payroll_budget_week_1..5)",
         "description": "Average payroll-budget % across all five weeks."},
        {"name": "max_week_pct",   "tier": "tab_derived", "type": "REAL", "formula": "max(payroll_budget_week_1..5)",
         "description": "Highest single-week payroll-budget % (worst week)."},
    ],
}


def compute(conn) -> list[dict]:
    rows = [dict(r) for r in conn.execute('SELECT * FROM "payroll_data"').fetchall()]
    out: list[dict] = []
    for r in rows:
        weeks = [r.get(c) for c in WEEK_COLS if r.get(c) is not None]
        avg = sum(weeks) / len(weeks) if weeks else None
        mx = max(weeks) if weeks else None
        out.append({**r, "avg_budget_pct": avg, "max_week_pct": mx})
    return out
