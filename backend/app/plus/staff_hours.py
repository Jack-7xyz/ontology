"""Staff Hours+ — staging Plus tab over `staff_hours` source. Adds FT/PT tier (>140 hrs = FT)."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "staff_hours",
    "label": "Staff Hours+",
    "source_table": "staff_hours",
    "description": "Hours per associate per period. Adds FT/PT classification at the 140-hour cut.",
    "columns": [
        {"name": "date",     "tier": "raw", "type": "TEXT", "formula": None, "description": "Period date."},
        {"name": "staff",    "tier": "raw", "type": "TEXT", "formula": None, "description": "Associate identifier (numeric IDs ingested as REAL)."},
        {"name": "location", "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "title",    "tier": "raw", "type": "TEXT", "formula": None, "description": "Job title."},
        {"name": "hours",    "tier": "raw", "type": "REAL", "formula": None, "description": "Hours worked in the period."},

        {"name": "hours_tier", "tier": "tab_derived", "type": "TEXT", "formula": "FT if hours > 140 else PT",
         "description": "Full-time / part-time classification at the 140-hour threshold."},
    ],
}


def compute(conn) -> list[dict]:
    rows = [dict(r) for r in conn.execute('SELECT * FROM "staff_hours"').fetchall()]
    out: list[dict] = []
    for r in rows:
        h = r.get("hours")
        tier = None if h is None else ("FT" if h > 140 else "PT")
        out.append({**r, "hours_tier": tier})
    return out
