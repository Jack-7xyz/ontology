"""Ask Ontology endpoint — view-aware Claude API integration.

Request:
  POST /api/ask
  {
    "view_type": "bi" | "plus" | "source" | "mech",
    "view_id":   "<id>",
    "message":   "<user question>",
    "history":   [{"role": "user"|"assistant", "content": "..."}, ...]
  }

Response:
  200 { "narrative": "...", "action": {...} | null, "notes": [...]? }
  400 on bad view, 429 on rate limit, 502 on Claude error, 503 if key missing.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..ask_ontology import client as ask_client
from ..ask_ontology import rate_limit
from ..ask_ontology.schema_pack import build_schema_pack
from ..ask_ontology.validators import ActionValidationError, validate_and_sanitize_action

log = logging.getLogger("ask_ontology")

router = APIRouter(prefix="/api/ask", tags=["ask-ontology"])


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    view_type: Literal["bi", "plus", "source", "mech", "global"]
    # For `global`, view_id is just a stable placeholder (conventionally "all").
    view_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=40)


class AskResponse(BaseModel):
    narrative: str
    action: dict[str, Any] | None = None
    notes: list[str] = Field(default_factory=list)


@router.post("", response_model=AskResponse)
def ask_ontology(req: AskRequest, request: Request) -> AskResponse:
    # Rate limit (localhost dev guard, 20/min per IP).
    client_key = request.client.host if request.client else "unknown"
    allowed, retry_after = rate_limit.check(client_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"rate limit exceeded; retry after {retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )

    # Build schema pack (raises ValueError on bad view).
    try:
        pack = build_schema_pack(req.view_type, req.view_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Call Claude.
    try:
        history_dicts = [h.model_dump() for h in req.history]
        tool_input = ask_client.ask(
            user_message=req.message,
            history=history_dicts,
            schema_pack=pack,
            view_type=req.view_type,
            view_id=req.view_id,
        )
    except RuntimeError as e:
        # Missing API key or no tool_use in response.
        log.exception("ask_ontology RuntimeError")
        msg = str(e)
        if "ANTHROPIC_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=502, detail=f"claude error: {msg}") from e
    except Exception as e:  # SDK / network / 4xx from Anthropic
        log.exception("ask_ontology upstream error")
        raise HTTPException(status_code=502, detail=f"claude error: {e}") from e

    # Validate action; if unfixable, strip it and note the problem.
    narrative = str(tool_input.get("narrative", "")).strip()
    raw_action = tool_input.get("action")
    notes: list[str] = []
    sanitized: dict[str, Any] | None = None
    try:
        sanitized = validate_and_sanitize_action(raw_action, req.view_type, req.view_id)
    except ActionValidationError as e:
        notes.append(f"action stripped: {e}")
        log.warning("ask_ontology action validation failed: %s", e)

    return AskResponse(narrative=narrative, action=sanitized, notes=notes)
