"""Connector interface.

Every source declares its honest mode - `live`, `export`, or `manual`. That
declaration is what lets the dashboard say "ChatGPT: 23 days stale" instead of
quietly implying full coverage. A source of truth that hides its own gaps is
worse than one that admits them.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Protocol, runtime_checkable


@dataclass
class Turn:
    role: str
    text: str
    at: str | None = None


@dataclass
class RawConversation:
    external_id: str
    title: str
    turns: list[Turn]
    model: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    origin_path: str | None = None
    extra: dict = field(default_factory=dict)

    def content_hash(self) -> str:
        """Stable across re-imports, so dropping the same export twice is free."""
        h = hashlib.sha256()
        h.update(self.external_id.encode())
        for turn in self.turns:
            h.update(turn.role.encode())
            h.update(turn.text.encode())
        return h.hexdigest()

    def to_json(self) -> str:
        return json.dumps(
            {
                "external_id": self.external_id,
                "title": self.title,
                "model": self.model,
                "started_at": self.started_at,
                "ended_at": self.ended_at,
                "origin_path": self.origin_path,
                "extra": self.extra,
                "turns": [
                    {"role": t.role, "text": t.text, "at": t.at} for t in self.turns
                ],
            },
            indent=2,
            ensure_ascii=False,
        )


@runtime_checkable
class Connector(Protocol):
    name: str
    mode: str
    stale_after_h: int

    def root(self) -> Path | None:
        """Where this connector reads from, or None if not present on this machine."""

    def discover(self) -> Iterator[RawConversation]:
        """Yield everything currently available. Ingest handles deduplication."""


def coerce_text(value: object) -> str:
    """Flatten the various content shapes CLI transcripts use into plain text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for block in value:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if isinstance(block.get("text"), str):
                    parts.append(block["text"])
                elif block.get("type") == "tool_use":
                    parts.append(f"[tool: {block.get('name', 'unknown')}]")
                elif block.get("type") == "tool_result":
                    parts.append("[tool result]")
        return "\n".join(p for p in parts if p)
    if isinstance(value, dict):
        return coerce_text(value.get("content"))
    return str(value)


def read_jsonl(path: Path) -> Iterator[dict]:
    """Read a JSONL transcript, skipping malformed lines rather than dying.

    One corrupt line in a months-old transcript must not cost us the file.
    """
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    yield record
    except OSError:
        return
