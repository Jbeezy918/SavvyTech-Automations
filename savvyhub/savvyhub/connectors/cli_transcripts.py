"""Connectors for coding-CLI transcripts that already sit on disk as JSONL.

These are the genuinely automatic sources: no export step, no credentials, no
API. The files change, the watcher notices, the conversation lands. Claude Code
and Codex share enough transcript shape to share a parser.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from .base import RawConversation, Turn, coerce_text, read_jsonl

# Transcript layouts drift between releases, so these are candidates rather than
# guarantees. Whichever exists on this machine wins; missing ones are skipped.
CLAUDE_CODE_ROOTS = ["~/.claude/projects", "~/.config/claude/projects"]
CODEX_ROOTS = ["~/.codex/sessions", "~/.config/codex/sessions"]

_ROLE_KEYS = ("role", "type", "sender")
_TEXT_KEYS = ("message", "content", "text", "payload")


def _first_existing(candidates: list[str]) -> Path | None:
    for candidate in candidates:
        path = Path(candidate).expanduser()
        if path.is_dir():
            return path
    return None


def _extract_turn(record: dict) -> Turn | None:
    role = ""
    for key in _ROLE_KEYS:
        value = record.get(key)
        if isinstance(value, str) and value:
            role = value
            break
    if role not in {"user", "assistant", "human", "system"}:
        # Tool traces, metadata records, summaries - not conversation turns.
        return None
    role = "user" if role == "human" else role

    text = ""
    for key in _TEXT_KEYS:
        if key in record:
            text = coerce_text(record[key])
            if text:
                break
    if not text.strip():
        return None

    at = record.get("timestamp") or record.get("created_at") or record.get("ts")
    return Turn(role=role, text=text, at=at if isinstance(at, str) else None)


def _title_from(turns: list[Turn], fallback: str) -> str:
    for turn in turns:
        if turn.role == "user":
            line = " ".join(turn.text.split())
            if line:
                return line[:120]
    return fallback


class JsonlTranscriptConnector:
    """Walks a directory tree of JSONL transcripts, one file per session."""

    mode = "live"
    stale_after_h = 24

    def __init__(self, name: str, roots: list[str]):
        self.name = name
        self._roots = roots

    def set_roots(self, roots: list[str]) -> None:
        """Point this connector somewhere other than the default location."""
        self._roots = roots

    def root(self) -> Path | None:
        return _first_existing(self._roots)

    def discover(self) -> Iterator[RawConversation]:
        root = self.root()
        if root is None:
            return

        for path in sorted(root.rglob("*.jsonl")):
            turns: list[Turn] = []
            model: str | None = None
            for record in read_jsonl(path):
                if model is None and isinstance(record.get("model"), str):
                    model = record["model"]
                turn = _extract_turn(record)
                if turn is not None:
                    turns.append(turn)

            if not turns:
                continue

            stamps = [t.at for t in turns if t.at]
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                mtime = 0.0

            yield RawConversation(
                external_id=str(path.relative_to(root)),
                title=_title_from(turns, path.stem),
                turns=turns,
                model=model,
                started_at=stamps[0] if stamps else None,
                ended_at=stamps[-1] if stamps else None,
                origin_path=str(path),
                extra={"mtime": mtime, "project": path.parent.name},
            )


def claude_code() -> JsonlTranscriptConnector:
    return JsonlTranscriptConnector("claude-code", CLAUDE_CODE_ROOTS)


def codex() -> JsonlTranscriptConnector:
    return JsonlTranscriptConnector("codex", CODEX_ROOTS)
