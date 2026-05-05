"""Server-side validation of Claude-emitted actions.

Purpose: reject actions that reference unknown columns, malformed shapes, or
view types that are narrative-only. The frontend trusts this layer — we don't
want a hallucinated column to propagate to the filter cache.

All validators mutate in place where sensible and raise `ActionValidationError`
on unfixable problems. The router catches these and strips the action while
keeping the narrative (so the user still gets an answer).
"""

from __future__ import annotations

from typing import Any

from .schema_pack import ACTIONABLE_VIEW_TYPES, RENDERABLE_VIEW_TYPES, columns_for

_VALID_FILTER_KINDS = {"set", "text", "number", "flag"}
_VALID_TEXT_OPS = {"contains", "equals", "starts_with"}
_VALID_NUMBER_OPS = {"=", ">", ">=", "<", "<=", "between"}
_VALID_FLAG_COLORS = {"green", "yellow", "red"}
_VALID_SORT_DIRS = {"asc", "desc"}
_VALID_RENDER_SOURCE_TYPES = {"bi", "plus", "source"}
_RENDER_LIMIT_DEFAULT = 50
_RENDER_LIMIT_MAX = 200


class ActionValidationError(ValueError):
    """Raised when a Claude action cannot be made safe; router strips the action."""


def validate_and_sanitize_action(
    action: Any,
    view_type: str,
    view_id: str,
) -> dict[str, Any] | None:
    """Return a sanitized action dict, or None if there's no action to apply.

    Raises ActionValidationError if the action is present but unfixable.
    """
    if action is None:
        return None
    if not isinstance(action, dict):
        raise ActionValidationError(f"action must be object or null, got {type(action).__name__}")

    # Cross-app (global) surface — only `render_table` is valid.
    if view_type in RENDERABLE_VIEW_TYPES:
        return _sanitize_global_action(action)

    # Mechanic views are narrative-only — any action is a protocol violation.
    if view_type not in ACTIONABLE_VIEW_TYPES:
        raise ActionValidationError(f"view_type {view_type!r} is narrative-only; action not allowed")

    # render_table on a view-scoped surface is a protocol violation.
    if action.get("render_table") is not None:
        raise ActionValidationError(
            "render_table is only valid on the cross-app (global) surface"
        )

    whitelist = set(columns_for(view_type, view_id))

    sanitized: dict[str, Any] = {}

    # --- filter ---
    if "filter" in action:
        filt = action["filter"]
        if filt is None:
            sanitized["filter"] = None  # explicit clear
        else:
            sanitized["filter"] = _sanitize_filter_state(filt, whitelist)

    # --- sort ---
    if "sort" in action:
        srt = action["sort"]
        if srt is None:
            sanitized["sort"] = None  # explicit clear
        else:
            sanitized["sort"] = _sanitize_sort(srt, whitelist)

    # Empty action object → treat as no-op.
    if not sanitized:
        return None
    return sanitized


def _sanitize_global_action(action: dict[str, Any]) -> dict[str, Any] | None:
    """Global/full-page surface only accepts `render_table`. filter/sort are
    rejected since there's no single active view to pilot."""
    if action.get("filter") is not None or action.get("sort") is not None:
        raise ActionValidationError(
            "filter/sort not allowed on the cross-app surface; use render_table"
        )
    spec = action.get("render_table")
    if spec is None:
        return None
    return {"render_table": _sanitize_render_table(spec)}


def _sanitize_render_table(spec: Any) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ActionValidationError(f"render_table must be object, got {type(spec).__name__}")

    source_type = spec.get("source_type")
    source_id = spec.get("source_id")
    if source_type not in _VALID_RENDER_SOURCE_TYPES:
        raise ActionValidationError(
            f"render_table.source_type {source_type!r} invalid; "
            f"expected one of {_VALID_RENDER_SOURCE_TYPES}"
        )
    if not isinstance(source_id, str) or not source_id:
        raise ActionValidationError("render_table.source_id must be a non-empty string")

    # Per-source whitelist lookup — raises ValueError on unknown id, which
    # we re-raise as ActionValidationError so the router strips cleanly.
    try:
        whitelist = set(columns_for(source_type, source_id))
    except ValueError as e:
        raise ActionValidationError(str(e)) from e

    out: dict[str, Any] = {"source_type": source_type, "source_id": source_id}

    # Optional column projection
    cols = spec.get("columns")
    if cols is not None:
        if not isinstance(cols, list) or not all(isinstance(c, str) for c in cols):
            raise ActionValidationError("render_table.columns must be list of strings")
        clean_cols: list[str] = []
        seen: set[str] = set()
        for col in cols:
            if col in whitelist and col not in seen:
                clean_cols.append(col)
                seen.add(col)
        if clean_cols:
            out["columns"] = clean_cols

    # Optional filter — reuse the existing filter-state sanitizer with this source's whitelist
    filt = spec.get("filter")
    if filt is not None:
        out["filter"] = _sanitize_filter_state(filt, whitelist)

    # Optional sort — reuse sort sanitizer
    srt = spec.get("sort")
    if srt is not None:
        out["sort"] = _sanitize_sort(srt, whitelist)

    # Limit — clamp to [1, 200], default 50
    lim = spec.get("limit")
    if lim is None:
        out["limit"] = _RENDER_LIMIT_DEFAULT
    else:
        if not isinstance(lim, int) or isinstance(lim, bool):
            raise ActionValidationError("render_table.limit must be an integer")
        if lim < 1:
            raise ActionValidationError("render_table.limit must be >= 1")
        out["limit"] = min(lim, _RENDER_LIMIT_MAX)

    return out


def _sanitize_filter_state(state: Any, whitelist: set[str]) -> dict[str, Any]:
    if not isinstance(state, dict):
        raise ActionValidationError(f"filter must be object, got {type(state).__name__}")
    conditions = state.get("conditions")
    if not isinstance(conditions, list):
        raise ActionValidationError("filter.conditions must be a list")

    clean: list[dict[str, Any]] = []
    for i, cond in enumerate(conditions):
        clean.append(_sanitize_condition(cond, whitelist, i))
    return {"conditions": clean}


def _sanitize_condition(cond: Any, whitelist: set[str], idx: int) -> dict[str, Any]:
    if not isinstance(cond, dict):
        raise ActionValidationError(f"conditions[{idx}] must be object")
    kind = cond.get("kind")
    if kind not in _VALID_FILTER_KINDS:
        raise ActionValidationError(f"conditions[{idx}].kind {kind!r} invalid; expected one of {_VALID_FILTER_KINDS}")

    if kind == "set":
        col = cond.get("column")
        vals = cond.get("values")
        if col not in whitelist:
            raise ActionValidationError(f"conditions[{idx}].column {col!r} not in whitelist")
        if not isinstance(vals, list) or not vals or not all(isinstance(v, str) for v in vals):
            raise ActionValidationError(f"conditions[{idx}].values must be non-empty list of strings")
        return {"kind": "set", "column": col, "values": vals}

    if kind == "text":
        col = cond.get("column")
        op = cond.get("op")
        val = cond.get("value")
        if col not in whitelist:
            raise ActionValidationError(f"conditions[{idx}].column {col!r} not in whitelist")
        if op not in _VALID_TEXT_OPS:
            raise ActionValidationError(f"conditions[{idx}].op {op!r} invalid")
        if not isinstance(val, str):
            raise ActionValidationError(f"conditions[{idx}].value must be string")
        return {"kind": "text", "column": col, "op": op, "value": val}

    if kind == "number":
        col = cond.get("column")
        op = cond.get("op")
        if col not in whitelist:
            raise ActionValidationError(f"conditions[{idx}].column {col!r} not in whitelist")
        if op not in _VALID_NUMBER_OPS:
            raise ActionValidationError(f"conditions[{idx}].op {op!r} invalid")
        out: dict[str, Any] = {"kind": "number", "column": col, "op": op}
        if op == "between":
            mn, mx = cond.get("min"), cond.get("max")
            if not _is_number(mn) or not _is_number(mx):
                raise ActionValidationError(f"conditions[{idx}] between requires numeric min+max")
            out["min"], out["max"] = float(mn), float(mx)
        else:
            v = cond.get("value")
            if not _is_number(v):
                raise ActionValidationError(f"conditions[{idx}] requires numeric value")
            out["value"] = float(v)
        return out

    if kind == "flag":
        color = cond.get("color")
        if color not in _VALID_FLAG_COLORS:
            raise ActionValidationError(f"conditions[{idx}].color {color!r} invalid")
        out = {"kind": "flag", "color": color}
        col = cond.get("column")
        if col is not None:
            if col not in whitelist:
                raise ActionValidationError(f"conditions[{idx}].column {col!r} not in whitelist")
            out["column"] = col
        return out

    raise ActionValidationError(f"conditions[{idx}].kind {kind!r} unreachable")


def _sanitize_sort(sort: Any, whitelist: set[str]) -> dict[str, Any]:
    if not isinstance(sort, dict):
        raise ActionValidationError("sort must be object or null")
    col = sort.get("column")
    direction = sort.get("direction")
    if col not in whitelist:
        raise ActionValidationError(f"sort.column {col!r} not in whitelist")
    if direction not in _VALID_SORT_DIRS:
        raise ActionValidationError(f"sort.direction {direction!r} invalid")
    return {"column": col, "direction": direction}


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)
