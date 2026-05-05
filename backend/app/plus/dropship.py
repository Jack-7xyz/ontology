"""Dropship+ — staging Plus tab over `dropship_data`. No derived metrics (per Jack's spec)."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "dropship",
    "label": "Dropship+",
    "source_table": "dropship_data",
    "description": "Per-store dropship totals + compliance %. No derived metrics yet "
                   "(dropship_total_orders / compliant_orders ingested as TEXT — mixed types in source xlsx).",
    "columns": [
        {"name": "date",                   "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",         "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "dropship_total_orders",  "tier": "raw", "type": "TEXT", "formula": None, "description": "Total dropship orders (TEXT — empty/string mix in source)."},
        {"name": "compliant_orders",       "tier": "raw", "type": "TEXT", "formula": None, "description": "Compliant dropship orders (TEXT — empty/string mix in source)."},
        {"name": "dropship_compliance",    "tier": "raw", "type": "REAL", "formula": None, "description": "Dropship compliance %."},
    ],
}


def compute(conn) -> list[dict]:
    return [dict(r) for r in conn.execute('SELECT * FROM "dropship_data"').fetchall()]
