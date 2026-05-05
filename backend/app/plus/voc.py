"""VOC+ — staging Plus tab over `voc_data` source. No derived metrics (per Jack's spec)."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "voc",
    "label": "VOC+",
    "source_table": "voc_data",
    "description": "Voice-of-Customer overall score per store-date. No derived metrics yet.",
    "columns": [
        {"name": "date",              "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",    "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "voc_overall_score", "tier": "raw", "type": "REAL", "formula": None, "description": "Voice-of-Customer composite score."},
    ],
}


def compute(conn) -> list[dict]:
    return [dict(r) for r in conn.execute('SELECT * FROM "voc_data"').fetchall()]
