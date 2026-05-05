"""Ontology Improvements catalog endpoints.

The catalog itself lives in `bi.improvements`; per-BI improvements are already
injected into each dashboard's META via `bi.get_meta()`. This router exposes
the cross-cutting cuts:

  GET /api/improvements/field_definitions
      — defensible meanings for every enum (priority, effort, revenue tier,
        status). Drives RightPanel chip tooltips + future Notion DB description.

  GET /api/improvements/by_mechanic/{mechanic_id}
      — aggregates every improvement whose `mechanic` matches; returns both
        the improvements and the sorted union of their `bi_ids` so the
        Mechanics RightPanel can render "Touches these dashboards" chips.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..bi import improvements

router = APIRouter(prefix="/api/improvements", tags=["improvements"])


@router.get("/field_definitions")
def field_definitions() -> dict[str, dict[str, str]]:
    return improvements.FIELD_DEFINITIONS


@router.get("/by_mechanic/{mechanic_id}")
def by_mechanic(mechanic_id: str) -> dict[str, Any]:
    known = improvements.mechanic_ids()
    if mechanic_id not in known:
        raise HTTPException(
            status_code=404,
            detail=f"unknown mechanic: {mechanic_id}. Known: {known}",
        )
    return {
        "mechanic_id": mechanic_id,
        "improvements": improvements.improvements_for_mechanic(mechanic_id),
        "contributing_bi_ids": improvements.contributing_bi_ids_for_mechanic(mechanic_id),
    }


@router.get("/board")
def board() -> dict[str, Any]:
    """Kanban board: catalog items grouped by status, each column sorted P0→P1→P2."""
    return improvements.get_board()


@router.get("/all")
def all_improvements(sort: str = "priority") -> dict[str, Any]:
    """Flat list of all catalog items enriched with status + revenue_impact_tier.
    sort=priority (default) or sort=status."""
    items = improvements.get_all_enriched(sort=sort)
    return {"count": len(items), "items": items}
