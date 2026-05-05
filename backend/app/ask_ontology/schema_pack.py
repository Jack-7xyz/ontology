"""Schema pack builder for Ask Ontology.

Given a current view (type + id), produce:
- `view`: META of the active view (BI / Plus / Source / Mechanic)
- `upstream`: one-hop upstream metas (BI → Plus, Plus → Source, Mechanic → BI)
- `filterable_columns`: whitelist of column names the LLM may reference in filter actions
- `sortable_columns`: whitelist for sort actions (same set; kept separate for future divergence)

The pack is shaped to be cache-friendly (stable per view) and compact. Rows are
NOT included — they blow cache and Claude only needs the schema + flag rules
to reason about filter/sort targets. Narrative questions that need concrete
values are answered against the current-view META's `takeaways` + `key_insights`.

The whitelist is also used server-side to reject `set_filter` / `set_sort`
actions that reference unknown columns before returning them to the frontend.
"""

from __future__ import annotations

from typing import Any, Literal

from .. import bi, mechanics, plus
from ..db import get_conn, list_tables, table_columns, table_rowcount

ViewType = Literal["bi", "plus", "source", "mech", "global"]

# Mechanics are narrative-only in v1 — filter/sort action is never emitted for them.
# Global is also "not actionable" in the filter/sort sense — it uses `render_table` instead.
ACTIONABLE_VIEW_TYPES: set[str] = {"bi", "plus", "source"}
# Surfaces that may emit `render_table` — currently only the global/full-page view.
RENDERABLE_VIEW_TYPES: set[str] = {"global"}


def build_schema_pack(view_type: str, view_id: str) -> dict[str, Any]:
    """Entry point. Returns `{view, upstream, filterable_columns, sortable_columns, view_kind_label, actionable}`.

    Raises ValueError for unknown view_type or unknown view_id within a type.
    """
    if view_type == "bi":
        return _bi_pack(view_id)
    if view_type == "plus":
        return _plus_pack(view_id)
    if view_type == "source":
        return _source_pack(view_id)
    if view_type == "mech":
        return _mech_pack(view_id)
    if view_type == "global":
        return _global_pack()
    raise ValueError(f"unknown view_type: {view_type!r}")


# ---------- per-type builders ----------

def _bi_pack(bi_id: str) -> dict[str, Any]:
    if bi_id not in bi.REGISTRY:
        raise ValueError(f"unknown BI id: {bi_id!r}")
    meta = bi.get_meta(bi_id)
    upstream_plus_ids = meta.get("upstream_plus", []) or []
    upstream = [_trim_plus_meta(plus.get_meta(pid)) for pid in upstream_plus_ids if pid in plus.REGISTRY]
    cols = _column_names(meta)
    view = _trim_bi_meta(meta)
    with get_conn() as conn:
        view["rows"] = bi.compute(bi_id, conn)["rows"]
    return {
        "view_kind_label": "BI dashboard",
        "actionable": True,
        "view": view,
        "upstream": upstream,
        "filterable_columns": cols,
        "sortable_columns": cols,
    }


def _plus_pack(plus_id: str) -> dict[str, Any]:
    if plus_id not in plus.REGISTRY:
        raise ValueError(f"unknown Plus id: {plus_id!r}")
    meta = plus.get_meta(plus_id)
    source_table = meta.get("source_table")
    upstream: list[dict] = []
    if source_table:
        try:
            upstream.append(_source_meta(source_table))
        except ValueError:
            pass  # source table absent — leave upstream empty rather than crash
    cols = _column_names(meta)
    view = _trim_plus_meta(meta)
    with get_conn() as conn:
        view["rows"] = plus.compute(plus_id, conn)[:500]
    return {
        "view_kind_label": "Plus staging tab",
        "actionable": True,
        "view": view,
        "upstream": upstream,
        "filterable_columns": cols,
        "sortable_columns": cols,
    }


def _source_pack(table_name: str) -> dict[str, Any]:
    meta = _source_meta(table_name)
    with get_conn() as conn:
        meta["rows"] = [dict(r) for r in conn.execute(f'SELECT * FROM "{table_name}" LIMIT 300').fetchall()]
    cols = [c["name"] for c in meta["columns"]]
    return {
        "view_kind_label": "Source table (raw ingest)",
        "actionable": True,
        "view": meta,
        "upstream": [],  # source is the root
        "filterable_columns": cols,
        "sortable_columns": cols,
    }


def _mech_pack(mech_id: str) -> dict[str, Any]:
    if mech_id not in mechanics.REGISTRY:
        raise ValueError(f"unknown Mechanic id: {mech_id!r}")
    meta = mechanics.get_meta(mech_id)
    upstream_bi_ids = meta.get("upstream_bi", []) or meta.get("contributing_bi_ids", []) or []
    upstream = [_trim_bi_meta(bi.get_meta(bid)) for bid in upstream_bi_ids if bid in bi.REGISTRY]
    return {
        "view_kind_label": "Mechanic",
        "actionable": False,  # narrative-only in v1
        "view": _trim_mech_meta(meta),
        "upstream": upstream,
        "filterable_columns": [],
        "sortable_columns": [],
    }


# ---------- global pack (fat — full column lists across all views) ----------

def _global_pack() -> dict[str, Any]:
    """Cross-app overview pack. Contains the full column list for every BI/Plus/Source
    plus summary META for every Mechanic. Used by the homepage mini-dock and the
    full-page Ask Ontology route.

    Not actionable in the filter/sort sense (no single active view). Supports
    `render_table` instead — Claude names a source_type+source_id and optional
    filter/sort/columns/limit, and the frontend fetches + renders inline.
    """
    with get_conn() as conn:
        source_tables = list_tables(conn)
        sources_meta = [
            {
                "id": t,
                "label": t,
                "row_count": table_rowcount_safe(conn, t),
                "columns": [
                    {"name": c["name"], "type": c["type"]}
                    for c in table_columns(conn, t)
                ],
            }
            for t in source_tables
        ]

    plus_meta = [
        _trim_plus_meta_with_columns(plus.get_meta(pid))
        for pid in plus.REGISTRY
    ]
    bi_meta = [
        _trim_bi_meta_with_columns(bi.get_meta(bid))
        for bid in bi.REGISTRY
    ]
    mech_meta = [
        _trim_mech_meta(mechanics.get_meta(mid))
        for mid in mechanics.REGISTRY
    ]

    return {
        "view_kind_label": "Cross-app overview",
        "actionable": False,
        "renderable": True,
        "view": {
            "sources": sources_meta,
            "plus": plus_meta,
            "bi": bi_meta,
            "mechanics": mech_meta,
        },
        "upstream": [],
        "filterable_columns": [],  # per-source whitelist lives under view.*.columns
        "sortable_columns": [],
    }


def table_rowcount_safe(conn, table_name: str) -> int:
    """Row count with a best-effort fallback — avoids crashing the global pack
    if a table was dropped mid-session. Returns -1 on failure."""
    try:
        return table_rowcount(conn, table_name)
    except Exception:
        return -1


def _trim_plus_meta_with_columns(meta: dict) -> dict:
    """Plus meta with full column list — used by global pack where column-level
    reasoning matters. `_trim_plus_meta` (no suffix) strips columns for the
    upstream-pack case."""
    keep = {"id", "label", "source_table", "description", "columns"}
    out = {k: v for k, v in meta.items() if k in keep}
    if "columns" in out:
        out["columns"] = [
            {k: v for k, v in c.items() if k in {"name", "tier", "type", "description"}}
            for c in out["columns"]
        ]
    return out


def _trim_bi_meta_with_columns(meta: dict) -> dict:
    """BI meta with full column list. ontology_improvements dropped (huge + not useful
    for filter/sort/render reasoning)."""
    keep = {"id", "label", "description", "upstream_plus", "takeaways", "columns"}
    out = {k: v for k, v in meta.items() if k in keep}
    if "columns" in out:
        out["columns"] = [
            {k: v for k, v in c.items() if k in {"name", "tier", "type", "description"}}
            for c in out["columns"]
        ]
    return out


# ---------- source meta (built from SQLite pragma) ----------

def _source_meta(table_name: str) -> dict[str, Any]:
    with get_conn() as conn:
        if table_name not in list_tables(conn):
            raise ValueError(f"unknown source table: {table_name!r}")
        cols = table_columns(conn, table_name)
    return {
        "id": table_name,
        "label": table_name,
        "description": f"Raw source table `{table_name}` from the xlsx snapshot ingest.",
        "columns": [{"name": c["name"], "type": c["type"], "tier": "raw"} for c in cols],
    }


# ---------- trimmers — keep the pack compact ----------

def _trim_bi_meta(meta: dict) -> dict:
    """Drop ontology_improvements (large, not useful for filter/sort reasoning)."""
    keep = {"id", "label", "description", "upstream_plus", "takeaways", "columns"}
    return {k: v for k, v in meta.items() if k in keep}


def _trim_plus_meta(meta: dict) -> dict:
    keep = {"id", "label", "source_table", "description", "columns"}
    return {k: v for k, v in meta.items() if k in keep}


def _trim_mech_meta(meta: dict) -> dict:
    keep = {
        "id", "label", "deck_hook", "description", "upstream_bi",
        "utility", "logic_overview", "key_insights", "takeaways", "source_notes",
        "algorithms", "weaknesses", "contributing_bi_ids",
    }
    return {k: v for k, v in meta.items() if k in keep}


def _column_names(meta: dict) -> list[str]:
    return [c["name"] for c in meta.get("columns", []) if "name" in c]


# ---------- whitelist check (used by validators) ----------

def columns_for(view_type: str, view_id: str) -> list[str]:
    """Return the column whitelist for filter/sort validation without the full pack.

    Cheaper than build_schema_pack for the common case where the router just
    needs to verify a suggested action's column name is valid.
    """
    if view_type == "bi":
        if view_id not in bi.REGISTRY:
            raise ValueError(f"unknown BI id: {view_id!r}")
        return _column_names(bi.get_meta(view_id))
    if view_type == "plus":
        if view_id not in plus.REGISTRY:
            raise ValueError(f"unknown Plus id: {view_id!r}")
        return _column_names(plus.get_meta(view_id))
    if view_type == "source":
        meta = _source_meta(view_id)
        return [c["name"] for c in meta["columns"]]
    if view_type == "mech":
        return []  # narrative-only, no actionable columns
    if view_type == "global":
        return []  # global is not column-scoped — render_table has its own per-source check
    raise ValueError(f"unknown view_type: {view_type!r}")
