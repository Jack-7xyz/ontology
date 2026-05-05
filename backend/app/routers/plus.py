"""Plus-layer endpoints: list staging Plus tabs and fetch their (computed) rows."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..db import get_conn
from .. import plus

router = APIRouter(prefix="/api/plus", tags=["plus"])


@router.get("/info")
def plus_info() -> dict[str, Any]:
    """List all Plus tabs with full META (columns, tier, formula, description)."""
    return {
        "tables": plus.list_plus_ids(),
        "meta": {pid: plus.get_meta(pid) for pid in plus.list_plus_ids()},
    }


@router.get("/{plus_id}")
def plus_rows(
    plus_id: str,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Compute Plus rows for a tab + paginate. Computation is on every request — small data."""
    if plus_id not in plus.REGISTRY:
        raise HTTPException(status_code=404, detail=f"plus tab not found: {plus_id}")

    with get_conn() as conn:
        all_rows = plus.compute(plus_id, conn)

    total = len(all_rows)
    sliced = all_rows[offset : offset + limit]
    return {
        "table": plus_id,
        "meta": plus.get_meta(plus_id),
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": sliced,
    }
