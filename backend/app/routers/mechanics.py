"""Mechanics-layer endpoints: list mechanics + fetch their META + compute output."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..db import get_conn
from .. import mechanics

router = APIRouter(prefix="/api/mechanics", tags=["mechanics"])


@router.get("/info")
def mechanics_info() -> dict[str, Any]:
    """List all mechanics with full META (deck hook, algorithms, weaknesses,
    diagram spec, takeaways, ontology improvements)."""
    return {
        "mechanics": mechanics.list_mechanic_ids(),
        "meta": {mid: mechanics.get_meta(mid) for mid in mechanics.list_mechanic_ids()},
    }


@router.get("/{mechanic_id}")
def mechanic_rows(mechanic_id: str) -> dict[str, Any]:
    """Compute mechanic-specific output (rows, distribution, etc.) plus its META."""
    if mechanic_id not in mechanics.REGISTRY:
        raise HTTPException(status_code=404, detail=f"mechanic not found: {mechanic_id}")

    with get_conn() as conn:
        out = mechanics.compute(mechanic_id, conn)

    return {
        "mechanic": mechanic_id,
        "meta": mechanics.get_meta(mechanic_id),
        **out,
    }
