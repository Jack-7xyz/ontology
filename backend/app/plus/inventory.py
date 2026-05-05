"""Inventory+ — staging Plus tab over `inventory_data`. Adds inventory_variance and to_consistency.

Note (Jack's Q): all weeks can show full TO compliance and inventory_variance still ≠ 0, because
TO compliance only confirms the *transfer was received on schedule*. Variance comes from shrink,
miscount during validation, sales between snapshot moments, damages, and late-posted returns —
none of which TO compliance detects.
"""

from __future__ import annotations

from typing import Any

WEEK_COLS = [f"to_receiving_week_{i}" for i in range(1, 6)]

META: dict[str, Any] = {
    "id": "inventory",
    "label": "Inventory+",
    "source_table": "inventory_data",
    "description": "Per-store stock counts + 5-week TO (Transfer Order) compliance. Adds variance % "
                   "and TO consistency. NB: full TO compliance does NOT guarantee zero variance — "
                   "shrink, miscount, mid-period sales, and damages all show up as variance.",
    "columns": [
        {"name": "date",                  "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",        "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "stock_count_expected",  "tier": "raw", "type": "REAL", "formula": None, "description": "Expected on-hand units (system count)."},
        {"name": "stock_count_validated", "tier": "raw", "type": "REAL", "formula": None, "description": "Validated on-hand units (physical count)."},
        {"name": "to_receiving_week_1",   "tier": "raw", "type": "REAL", "formula": None, "description": "Week 1 transfer-order compliance (1 = compliant, 0 = not)."},
        {"name": "to_receiving_week_2",   "tier": "raw", "type": "REAL", "formula": None, "description": "Week 2 TO compliance."},
        {"name": "to_receiving_week_3",   "tier": "raw", "type": "REAL", "formula": None, "description": "Week 3 TO compliance."},
        {"name": "to_receiving_week_4",   "tier": "raw", "type": "REAL", "formula": None, "description": "Week 4 TO compliance."},
        {"name": "to_receiving_week_5",   "tier": "raw", "type": "REAL", "formula": None, "description": "Week 5 TO compliance."},

        {"name": "inventory_variance", "tier": "tab_derived", "type": "REAL", "formula": "(validated - expected) / expected",
         "description": "Variance from expected stock. Negative = short; positive = over."},
        {"name": "to_consistency",     "tier": "tab_derived", "type": "TEXT", "formula": "Full if all 5 weeks compliant else N/5",
         "description": "Compliance across the 5 TO receiving weeks. 'Full' when all 5; otherwise 'N/5'."},
    ],
}


def compute(conn) -> list[dict]:
    from . import safe_div

    rows = [dict(r) for r in conn.execute('SELECT * FROM "inventory_data"').fetchall()]
    out: list[dict] = []
    for r in rows:
        exp = r.get("stock_count_expected")
        val = r.get("stock_count_validated")
        weeks_present = [r.get(c) for c in WEEK_COLS if r.get(c) is not None]
        compliant_n = sum(1 for w in weeks_present if w == 1)
        if not weeks_present:
            consistency = None
        elif compliant_n == 5:
            consistency = "Full"
        else:
            consistency = f"{compliant_n}/5"
        variance = safe_div((val - exp) if (val is not None and exp is not None) else None, exp)
        out.append({**r, "inventory_variance": variance, "to_consistency": consistency})
    return out
