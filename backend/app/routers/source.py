"""Source-layer endpoints: browse raw ingested tables from the xlsx snapshot."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..db import get_conn, list_tables, table_columns, table_rowcount

router = APIRouter(prefix="/api", tags=["source"])

_IDENT = re.compile(r"^[a-z][a-z0-9_]*$")


def _safe_table(name: str, conn) -> str:
    if not _IDENT.match(name):
        raise HTTPException(status_code=400, detail=f"invalid table name: {name}")
    if name not in list_tables(conn):
        raise HTTPException(status_code=404, detail=f"table not found: {name}")
    return name


@router.get("/snapshot/info")
def snapshot_info() -> dict[str, Any]:
    """Return list of tables + per-table row counts + columns. Sanity check for ingest."""
    with get_conn() as conn:
        tables = list_tables(conn)
        return {
            "tables": tables,
            "rows_per": {t: table_rowcount(conn, t) for t in tables},
            "columns_per": {t: table_columns(conn, t) for t in tables},
        }


@router.get("/source/{table}")
def source_rows(
    table: str,
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Paginated rows for a source table. Columns in PRAGMA order."""
    with get_conn() as conn:
        tname = _safe_table(table, conn)
        cols = table_columns(conn, tname)
        total = table_rowcount(conn, tname)
        cur = conn.execute(
            f'SELECT * FROM "{tname}" LIMIT ? OFFSET ?', (limit, offset)
        )
        rows = [dict(r) for r in cur.fetchall()]
        return {
            "table": tname,
            "columns": cols,
            "total": total,
            "limit": limit,
            "offset": offset,
            "rows": rows,
        }
