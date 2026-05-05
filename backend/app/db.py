"""SQLite connection factory for the ontology snapshot."""

from __future__ import annotations

import sqlite3
from pathlib import Path

# backend/app/db.py → repo = parents[2]
REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "snapshot.db"


def get_conn() -> sqlite3.Connection:
    """Open a read-only-ish sqlite3 connection with Row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def list_tables(conn: sqlite3.Connection) -> list[str]:
    """Return user tables (excluding sqlite_ internals), alphabetically sorted."""
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return [r[0] for r in cur.fetchall()]


def table_columns(conn: sqlite3.Connection, table: str) -> list[dict]:
    """PRAGMA table_info → [{name, type}]."""
    cur = conn.execute(f'PRAGMA table_info("{table}")')
    return [{"name": r[1], "type": r[2]} for r in cur.fetchall()]


def table_rowcount(conn: sqlite3.Connection, table: str) -> int:
    cur = conn.execute(f'SELECT COUNT(*) FROM "{table}"')
    return int(cur.fetchone()[0])
