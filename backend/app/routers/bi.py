"""BI-layer endpoints: list BI dashboards and fetch their (computed) rows + flags."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..db import get_conn
from .. import bi

router = APIRouter(prefix="/api/bi", tags=["bi"])


@router.get("/info")
def bi_info() -> dict[str, Any]:
    """List all BI dashboards with full META (columns, formulas, flag rules, takeaways)."""
    return {
        "dashboards": bi.list_bi_ids(),
        "meta": {bid: bi.get_meta(bid) for bid in bi.list_bi_ids()},
    }


@router.get("/{bi_id}")
def bi_rows(
    bi_id: str,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Compute BI rows + flags for a dashboard, paginated."""
    if bi_id not in bi.REGISTRY:
        raise HTTPException(status_code=404, detail=f"bi dashboard not found: {bi_id}")

    with get_conn() as conn:
        out = bi.compute(bi_id, conn)

    all_rows = out["rows"]
    all_flags = out["flags"]
    total = len(all_rows)
    sliced_rows = all_rows[offset : offset + limit]
    sliced_flags = all_flags[offset : offset + limit]
    return {
        "dashboard": bi_id,
        "meta": bi.get_meta(bi_id),
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": sliced_rows,
        "flags": sliced_flags,
    }
