"""Import conversations into the archive and catalog.

Ingest is tier-1 work: it never touches the vault, so it needs no approval and
runs silently. It writes originals to the archive untouched and records facts
about them in SQLite. Turning conversations into knowledge is a separate,
reviewable step - see extract.py.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from . import db
from .config import Config
from .connectors import RawConversation, all_connectors


@dataclass
class ScanResult:
    source: str
    mode: str
    found: int = 0
    imported: int = 0
    skipped: int = 0
    error: str | None = None

    @property
    def status(self) -> str:
        if self.error:
            return f"error: {self.error[:120]}"
        return f"ok ({self.imported} new, {self.skipped} known)"


def archive_path(cfg: Config, source: str, content_hash: str) -> Path:
    """Content-addressed, so identical imports collapse onto one file."""
    return cfg.archive / source / content_hash[:2] / f"{content_hash}.json"


def _store(cfg: Config, source: str, convo: RawConversation, content_hash: str) -> Path:
    path = archive_path(cfg, source, content_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(convo.to_json(), encoding="utf-8")
    return path


def scan(cfg: Config, conn: sqlite3.Connection) -> list[ScanResult]:
    """Pull from every connector present on this machine."""
    results: list[ScanResult] = []

    for connector in all_connectors(cfg):
        result = ScanResult(source=connector.name, mode=connector.mode)
        root = connector.root()
        source_id = db.register_source(
            conn,
            connector.name,
            connector.mode,
            str(root) if root else None,
            connector.stale_after_h,
        )

        if root is None:
            result.error = "not present on this machine"
            db.mark_source_run(conn, source_id, result.status, ok=False)
            results.append(result)
            continue

        try:
            for convo in connector.discover():
                result.found += 1
                content_hash = convo.content_hash()

                if db.conversation_exists(conn, source_id, content_hash):
                    result.skipped += 1
                    continue

                stored = _store(cfg, connector.name, convo, content_hash)
                inserted = db.insert_conversation(
                    conn,
                    source_id=source_id,
                    external_id=convo.external_id,
                    title=convo.title[:300],
                    model=convo.model,
                    started_at=convo.started_at,
                    ended_at=convo.ended_at,
                    turn_count=len(convo.turns),
                    content_hash=content_hash,
                    archive_path=str(stored),
                    origin_path=convo.origin_path,
                )
                if inserted:
                    result.imported += 1
                else:
                    result.skipped += 1
        except Exception as exc:  # one bad source must not kill the whole scan
            result.error = f"{type(exc).__name__}: {exc}"

        db.mark_source_run(conn, source_id, result.status, ok=result.error is None)
        db.log(
            conn,
            "scan",
            connector.name,
            found=result.found,
            imported=result.imported,
            skipped=result.skipped,
            error=result.error,
        )
        results.append(result)

    return results
