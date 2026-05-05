"""Anthropic SDK wrapper for Ask Ontology.

Single entry point: `ask(user_message, history, schema_pack, view_type, view_id)`.
Returns the parsed tool_use payload from Claude's forced `respond()` call.

Prompt-cache strategy (two ephemeral breakpoints — TTL 5min):
  1. system + tool schema  → stable across all views
  2. view-pack + upstream-pack → stable per view (invalidates on view switch)

Sequential turns on the same view hit both caches → ~85%+ cached input per turn.
"""

from __future__ import annotations

import json
import os
from typing import Any

from anthropic import Anthropic

MODEL_ID = "claude-sonnet-4-6"
MAX_TOKENS = 1024

# ---------- tool schema ----------

FILTER_CONDITION_SCHEMA: dict[str, Any] = {
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "kind": {"const": "set"},
                "column": {"type": "string"},
                "values": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            },
            "required": ["kind", "column", "values"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "kind": {"const": "text"},
                "column": {"type": "string"},
                "op": {"enum": ["contains", "equals", "starts_with"]},
                "value": {"type": "string"},
            },
            "required": ["kind", "column", "op", "value"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "kind": {"const": "number"},
                "column": {"type": "string"},
                "op": {"enum": ["=", ">", ">=", "<", "<=", "between"]},
                "value": {"type": "number"},
                "min": {"type": "number"},
                "max": {"type": "number"},
            },
            "required": ["kind", "column", "op"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "kind": {"const": "flag"},
                "color": {"enum": ["green", "yellow", "red"]},
                "column": {"type": "string"},
            },
            "required": ["kind", "color"],
            "additionalProperties": False,
        },
    ]
}

RENDER_TABLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "source_type": {"enum": ["bi", "plus", "source"]},
        "source_id": {"type": "string"},
        "columns": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Optional — subset of columns to project. Must all exist in the "
                "named source. Omit to render all columns."
            ),
        },
        "filter": {
            "oneOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "properties": {
                        "conditions": {
                            "type": "array",
                            "items": FILTER_CONDITION_SCHEMA,
                        }
                    },
                    "required": ["conditions"],
                    "additionalProperties": False,
                },
            ],
        },
        "sort": {
            "oneOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string"},
                        "direction": {"enum": ["asc", "desc"]},
                    },
                    "required": ["column", "direction"],
                    "additionalProperties": False,
                },
            ],
        },
        "limit": {"type": "integer", "minimum": 1, "maximum": 200},
    },
    "required": ["source_type", "source_id"],
    "additionalProperties": False,
}

RESPOND_TOOL: dict[str, Any] = {
    "name": "respond",
    "description": (
        "Single forced response channel. Always call this exactly once. "
        "Put the human-readable answer in `narrative`. On a view-scoped surface "
        "(BI/Plus/Source), optionally set `action.filter` / `action.sort` to "
        "pilot the active view. On the cross-app (global) surface, optionally "
        "set `action.render_table` to produce an inline table from any source. "
        "Leave `action` null for pure narrative answers. Mechanic views are "
        "narrative-only — never emit action on them."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "narrative": {
                "type": "string",
                "description": (
                    "The answer the user reads. Ground it in the current view's "
                    "META/takeaways and its one-hop upstream metas. Keep it tight — "
                    "2-4 sentences unless the question explicitly demands more."
                ),
            },
            "action": {
                "oneOf": [
                    {"type": "null"},
                    {
                        "type": "object",
                        "properties": {
                            "filter": {
                                "oneOf": [
                                    {"type": "null"},  # null = clear existing filter
                                    {
                                        "type": "object",
                                        "properties": {
                                            "conditions": {
                                                "type": "array",
                                                "items": FILTER_CONDITION_SCHEMA,
                                            }
                                        },
                                        "required": ["conditions"],
                                        "additionalProperties": False,
                                    },
                                ],
                                "description": (
                                    "View-scoped only. Replace the view's filter state. "
                                    "null = clear all conditions. Omit to leave filter unchanged."
                                ),
                            },
                            "sort": {
                                "oneOf": [
                                    {"type": "null"},  # null = clear sort
                                    {
                                        "type": "object",
                                        "properties": {
                                            "column": {"type": "string"},
                                            "direction": {"enum": ["asc", "desc"]},
                                        },
                                        "required": ["column", "direction"],
                                        "additionalProperties": False,
                                    },
                                ],
                                "description": (
                                    "View-scoped only. null = clear sort. "
                                    "Omit to leave sort unchanged."
                                ),
                            },
                            "render_table": {
                                "oneOf": [
                                    {"type": "null"},
                                    RENDER_TABLE_SCHEMA,
                                ],
                                "description": (
                                    "Cross-app only. Render an inline table from "
                                    "any BI/Plus/Source. Specify source_type + "
                                    "source_id and optional columns/filter/sort/limit. "
                                    "Use to answer multi-view questions by showing "
                                    "one table per answer turn."
                                ),
                            },
                        },
                        "additionalProperties": False,
                    },
                ],
                "description": (
                    "Optional structured side-effect alongside the narrative. "
                    "Shape depends on the surface — see field docs."
                ),
            },
        },
        "required": ["narrative"],
        "additionalProperties": False,
    },
}

# ---------- system prompt ----------

SYSTEM_PROMPT = """You are Ask Ontology, the copilot inside the Retail Ontology analytics app.

Each turn you receive an "Active view" header and a view pack. The surface you're on
dictates what actions you may emit:

**View-scoped surfaces** (`bi` / `plus` / `source` / `mech`):
- Pack: the active view's META + one-hop upstream metas.
- Answer grounded in the pack's takeaways, flag-rule rationales, columns.
- `view.rows` contains the actual data rows. Use it for all counting and aggregation. Never estimate or guess — always compute from `view.rows` directly.
- On `bi`/`plus`/`source` you MAY emit `action.filter` and/or `action.sort` to pilot the table.
- On `mech` you MAY NOT emit any action (narrative only in v1).

**Cross-app surface** (`global`):
- Pack: compact catalog of every BI/Plus/Source (with columns) + mechanic summaries.
- You have no single active view — do NOT emit `filter` or `sort`.
- When the user asks for data, emit `action.render_table` — name a `source_type`+`source_id`,
  optionally add `columns`, `filter`, `sort`, `limit` (default 50, cap 200). The frontend
  renders the result inline in the chat.
- `render_table.source_type` may ONLY be `bi`, `plus`, or `source`. Mechanics are narrative
  context only and can never be rendered as tables.
- For multi-view questions, answer conversationally with ONE render_table per turn. The
  user or you-in-a-follow-up can fetch a second table next turn. Do not try to join.
- For fleet-wide store ranking questions, prefer the BI source `store_intel`. It already
  carries `store`, `red_count`, `red_domains`, `gross_sales`, `return_pct`, and related
  triage columns.

Rules across surfaces:
- Column names MUST exist in the relevant source's column list. Never invent.
- Never use a mechanic name or domain label as a column unless that exact column exists in the
  chosen source. Pick the source first, then pick columns from that source's column list only.
- Flag filters: `{kind: "flag", color, column?}`. Omit `column` for "any red"; include for
  a specific metric.
- "top N by X" → sort + limit (if render_table); otherwise sort only.
- "stores where X > N" → number filter.
- Categorical list → `{kind: "set", column, values: [...]}`.
- Clearing: `action.filter = null` clears; same for sort.

Output is always via the `respond` tool. Exactly one call, every turn."""


# ---------- main entry ----------

def ask(
    user_message: str,
    history: list[dict[str, Any]],
    schema_pack: dict[str, Any],
    view_type: str,
    view_id: str,
    client: Anthropic | None = None,
) -> dict[str, Any]:
    """Call Claude with the view's schema pack and return the parsed tool input.

    `history` is a list of prior `{role, content}` messages (content = plain text).
    Returned dict is the `respond` tool input: `{narrative, action?}`.
    """
    client = client or _default_client()

    messages = _build_messages(history, user_message, schema_pack, view_type, view_id)

    resp = client.messages.create(
        model=MODEL_ID,
        max_tokens=MAX_TOKENS,
        system=_system_blocks(),
        tools=[_cached_tool_block()],
        tool_choice={"type": "tool", "name": "respond"},
        messages=messages,
    )

    return _extract_tool_input(resp)


# ---------- internal builders ----------

def _default_client() -> Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set — Ask Ontology backend cannot reach Claude.")
    return Anthropic(api_key=api_key)


def _system_blocks() -> list[dict[str, Any]]:
    """Cache-breakpoint #1: system prompt (stable across all views)."""
    return [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _cached_tool_block() -> dict[str, Any]:
    """Tool schema is attached to cache breakpoint #1 via a separate ephemeral marker on the tool."""
    return {**RESPOND_TOOL, "cache_control": {"type": "ephemeral"}}


def _build_messages(
    history: list[dict[str, Any]],
    user_message: str,
    schema_pack: dict[str, Any],
    view_type: str,
    view_id: str,
) -> list[dict[str, Any]]:
    """Cache-breakpoint #2: view-pack block lives in the first user message."""
    view_pack_text = _format_schema_pack(schema_pack, view_type, view_id)
    head_user: dict[str, Any] = {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": view_pack_text,
                "cache_control": {"type": "ephemeral"},
            },
            # First actual user turn (or a placeholder if history is empty).
            {
                "type": "text",
                "text": history[0]["content"] if history else user_message,
            },
        ],
    }

    if not history:
        return [head_user]

    # Subsequent turns replay history as plain-text messages after the cached view-pack head.
    tail: list[dict[str, Any]] = []
    for turn in history[1:]:
        tail.append({"role": turn["role"], "content": turn["content"]})
    tail.append({"role": "user", "content": user_message})
    return [head_user, *tail]


def _format_schema_pack(pack: dict[str, Any], view_type: str, view_id: str) -> str:
    """Render the schema pack as a compact JSON block prefixed with a header.

    Claude parses JSON cheaply; prose framing would bloat tokens without helping grounding.
    """
    header = (
        f"## Active view\n"
        f"type: {view_type}\n"
        f"id: {view_id}\n"
        f"kind: {pack.get('view_kind_label', '?')}\n"
        f"actionable: {pack.get('actionable', False)}\n\n"
        f"## View pack + upstream\n"
    )
    body = json.dumps(
        {
            "view": pack["view"],
            "upstream": pack["upstream"],
            "filterable_columns": pack["filterable_columns"],
            "sortable_columns": pack["sortable_columns"],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return header + body


def _extract_tool_input(resp: Any) -> dict[str, Any]:
    """Pull the single `respond` tool_use block from the response."""
    text_fallback = _extract_text_fallback(resp)
    for block in getattr(resp, "content", []) or []:
        # Anthropic SDK returns typed blocks; tool_use has .type == "tool_use"
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "respond":
            tool_input = dict(block.input)
            narrative = str(tool_input.get("narrative", "")).strip()
            if not narrative and text_fallback:
                tool_input["narrative"] = text_fallback
            return tool_input
    if text_fallback:
        return {"narrative": text_fallback, "action": None}
    raise RuntimeError("Claude response did not include a forced `respond` tool call.")


def _extract_text_fallback(resp: Any) -> str:
    parts: list[str] = []
    for block in getattr(resp, "content", []) or []:
        if getattr(block, "type", None) == "text":
            text = getattr(block, "text", "")
            if text:
                parts.append(str(text).strip())
    joined = "\n\n".join(part for part in parts if part)
    return joined.strip()
