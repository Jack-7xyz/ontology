"""Visual+ — staging Plus tab over `visual_data` source. Adds any_late flag (any 'Late Submission')."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "visual",
    "label": "Visual+",
    "source_table": "visual_data",
    "description": "Floorset submission timing + scores. Adds an any_late flag if any of the three "
                   "floorsets came in as 'Late Submission'.",
    "columns": [
        {"name": "date",                    "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",          "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "floorset_1_submission",   "tier": "raw", "type": "TEXT", "formula": None, "description": "Floorset 1 submission status (e.g. 'On Time' / 'Late Submission')."},
        {"name": "floorset_1_score",        "tier": "raw", "type": "REAL", "formula": None, "description": "Floorset 1 visual score."},
        {"name": "floorset_2_submission",   "tier": "raw", "type": "TEXT", "formula": None, "description": "Floorset 2 submission status."},
        {"name": "floorset_2_score",        "tier": "raw", "type": "REAL", "formula": None, "description": "Floorset 2 visual score."},
        {"name": "floorset_3_submission",   "tier": "raw", "type": "TEXT", "formula": None, "description": "Floorset 3 submission status."},
        {"name": "floorset_3_score",        "tier": "raw", "type": "TEXT", "formula": None, "description": "Floorset 3 visual score (ingested as TEXT — mixed strings in source xlsx)."},
        {"name": "visual_score",            "tier": "raw", "type": "REAL", "formula": None, "description": "Composite visual score."},

        {"name": "any_late", "tier": "tab_derived", "type": "TEXT", "formula": "YES if any floorset_N_submission == 'Late Submission' else BLANK",
         "description": "YES if any of the three floorset submissions were flagged late. Blank otherwise."},
    ],
}


def compute(conn) -> list[dict]:
    rows = [dict(r) for r in conn.execute('SELECT * FROM "visual_data"').fetchall()]
    out: list[dict] = []
    for r in rows:
        late = any(
            (r.get(f"floorset_{i}_submission") or "").strip().lower() == "late submission"
            for i in (1, 2, 3)
        )
        out.append({**r, "any_late": "YES" if late else ""})
    return out
