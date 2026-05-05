"""2-Week Notice trigger endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..db import get_conn
from ..triggers import (
    compute_today,
    compute_hidden,
    compute_notice,
    compute_tier3,
    compute_tier4,
)

router = APIRouter(prefix="/api/triggers", tags=["triggers"])


@router.get("/today")
def triggers_today() -> dict[str, Any]:
    """Low Productivity associates — current cascade's 14."""
    with get_conn() as conn:
        rows = compute_today(conn)
    return {"count": len(rows), "rows": rows}


@router.get("/hidden")
def triggers_hidden() -> dict[str, Any]:
    """HG Processors below 60% S/Hr — underperformers hidden by the HG flag."""
    with get_conn() as conn:
        rows = compute_hidden(conn)
    return {"count": len(rows), "rows": rows}


@router.get("/notice")
def triggers_notice() -> dict[str, Any]:
    """Notice — FT escalation candidates: Immediate (<40% S/Hr or >+20pp refund) or Standard (40–60% S/Hr)."""
    with get_conn() as conn:
        rows = compute_notice(conn)
    return {"count": len(rows), "rows": rows}


@router.get("/tier3")
def triggers_tier3() -> dict[str, Any]:
    """Tier 3 — Compound Notice candidates: 2+ of 5 signals."""
    with get_conn() as conn:
        rows = compute_tier3(conn)
    return {"count": len(rows), "rows": rows}


@router.get("/tier4")
def triggers_tier4() -> dict[str, Any]:
    """Tier 4 — Recognition: Top Performer associates."""
    with get_conn() as conn:
        rows = compute_tier4(conn)
    return {"count": len(rows), "rows": rows}
