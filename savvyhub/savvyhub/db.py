"""SQLite access. Thin on purpose - the schema carries the design."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text())


def log(conn: sqlite3.Connection, kind: str, subject: str = "", **detail: Any) -> None:
    """Append to the audit trail. Nothing in here is ever rewritten."""
    conn.execute(
        "INSERT INTO events (kind, subject, detail) VALUES (?, ?, ?)",
        (kind, subject, json.dumps(detail, default=str) if detail else None),
    )


def register_source(
    conn: sqlite3.Connection,
    name: str,
    mode: str,
    root_path: str | None = None,
    stale_after_h: int = 24,
) -> int:
    conn.execute(
        """
        INSERT INTO sources (name, mode, root_path, stale_after_h)
             VALUES (?, ?, ?, ?)
        ON CONFLICT (name) DO UPDATE SET
            mode = excluded.mode,
            root_path = COALESCE(excluded.root_path, sources.root_path),
            stale_after_h = excluded.stale_after_h
        """,
        (name, mode, root_path, stale_after_h),
    )
    row = conn.execute("SELECT id FROM sources WHERE name = ?", (name,)).fetchone()
    return int(row["id"])


def mark_source_run(
    conn: sqlite3.Connection, source_id: int, status: str, ok: bool = True
) -> None:
    """Record a connector run.

    `last_import_at` only advances on a run that actually succeeded. A source
    that is missing or erroring must keep ageing into staleness rather than
    reporting itself fresh because something ran and failed.
    """
    if ok:
        conn.execute(
            "UPDATE sources SET last_import_at = datetime('now'), last_status = ? WHERE id = ?",
            (status, source_id),
        )
    else:
        conn.execute(
            "UPDATE sources SET last_status = ? WHERE id = ?", (status, source_id)
        )


def source_health(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Per-source freshness, so the dashboard can admit what it is missing."""
    rows = conn.execute(
        """
        SELECT s.name,
               s.mode,
               s.enabled,
               s.last_import_at,
               s.last_status,
               s.stale_after_h,
               (SELECT COUNT(*) FROM conversations c WHERE c.source_id = s.id) AS conversations,
               CASE
                   WHEN s.last_import_at IS NULL THEN 1
                   WHEN julianday('now') - julianday(s.last_import_at)
                        > s.stale_after_h / 24.0 THEN 1
                   ELSE 0
               END AS stale
          FROM sources s
         ORDER BY stale DESC, s.mode, s.name
        """
    ).fetchall()
    return [dict(r) for r in rows]


def conversation_exists(conn: sqlite3.Connection, source_id: int, content_hash: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM conversations WHERE source_id = ? AND content_hash = ?",
        (source_id, content_hash),
    ).fetchone()
    return row is not None


def insert_conversation(conn: sqlite3.Connection, **fields: Any) -> int | None:
    """Insert a conversation, or return None if we already have it.

    Idempotent by (source_id, content_hash) so re-importing the same export is
    free rather than duplicative.
    """
    cols = ", ".join(fields)
    marks = ", ".join("?" * len(fields))
    cur = conn.execute(
        f"INSERT OR IGNORE INTO conversations ({cols}) VALUES ({marks})",
        tuple(fields.values()),
    )
    return int(cur.lastrowid) if cur.rowcount else None


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    def one(sql: str, args: Iterable[Any] = ()) -> int:
        return int(conn.execute(sql, tuple(args)).fetchone()[0])

    return {
        "conversations": one("SELECT COUNT(*) FROM conversations"),
        "unextracted": one("SELECT COUNT(*) FROM conversations WHERE extracted_at IS NULL"),
        "items": one("SELECT COUNT(*) FROM items WHERE status = 'current'"),
        "pending": one("SELECT COUNT(*) FROM proposals WHERE status = 'pending'"),
        "sources": one("SELECT COUNT(*) FROM sources WHERE enabled = 1"),
    }
