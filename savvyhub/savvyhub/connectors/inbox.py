"""Inbox connector - the drop zone for everything that has no API.

Claude.ai, ChatGPT and Gemini expose no endpoint for reading your own chat
history. The only supported path is their export, so the manual step is
downloading a zip; everything after that is automatic. Drop it in `inbox/` and
it gets parsed, hashed, archived and deduped like any other source.

Reading a ChatGPT export off local disk sends nothing to OpenAI. No account is
linked and no request leaves the machine - it is a file on your Mac.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Iterator

from .base import RawConversation, Turn, coerce_text

TEXT_SUFFIXES = {".md", ".txt"}


def _chatgpt(payload: list, origin: str) -> Iterator[RawConversation]:
    """ChatGPT export: conversations.json, turns held in a `mapping` graph."""
    for convo in payload:
        if not isinstance(convo, dict) or "mapping" not in convo:
            continue
        nodes = [
            node.get("message")
            for node in convo.get("mapping", {}).values()
            if isinstance(node, dict) and isinstance(node.get("message"), dict)
        ]
        nodes = [m for m in nodes if m]
        nodes.sort(key=lambda m: m.get("create_time") or 0)

        turns = []
        for message in nodes:
            role = (message.get("author") or {}).get("role", "")
            if role not in {"user", "assistant"}:
                continue
            parts = (message.get("content") or {}).get("parts")
            text = coerce_text(parts)
            if text.strip():
                turns.append(Turn(role=role, text=text))

        if turns:
            yield RawConversation(
                external_id=str(convo.get("id") or convo.get("conversation_id") or ""),
                title=str(convo.get("title") or "Untitled"),
                turns=turns,
                model="chatgpt",
                origin_path=origin,
            )


def _claude_ai(payload: list, origin: str) -> Iterator[RawConversation]:
    """Claude.ai export: conversations.json with a flat `chat_messages` list."""
    for convo in payload:
        if not isinstance(convo, dict) or "chat_messages" not in convo:
            continue
        turns = []
        for message in convo.get("chat_messages") or []:
            if not isinstance(message, dict):
                continue
            sender = message.get("sender", "")
            role = "user" if sender == "human" else "assistant"
            text = message.get("text") or coerce_text(message.get("content"))
            if text and text.strip():
                turns.append(Turn(role=role, text=text, at=message.get("created_at")))

        if turns:
            yield RawConversation(
                external_id=str(convo.get("uuid") or ""),
                title=str(convo.get("name") or "Untitled"),
                turns=turns,
                model="claude",
                started_at=convo.get("created_at"),
                ended_at=convo.get("updated_at"),
                origin_path=origin,
            )


def _parse_json(raw: bytes, origin: str) -> Iterator[RawConversation]:
    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    if not isinstance(payload, list):
        payload = [payload]

    # Sniff the shape rather than trusting the filename.
    if any(isinstance(c, dict) and "mapping" in c for c in payload):
        yield from _chatgpt(payload, origin)
    elif any(isinstance(c, dict) and "chat_messages" in c for c in payload):
        yield from _claude_ai(payload, origin)


def _parse_text(path: Path) -> Iterator[RawConversation]:
    try:
        body = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return
    if not body.strip():
        return
    yield RawConversation(
        external_id=path.name,
        title=path.stem,
        turns=[Turn(role="user", text=body)],
        model="unknown",
        origin_path=str(path),
    )


class InboxConnector:
    name = "inbox"
    mode = "manual"
    stale_after_h = 24 * 14

    def __init__(self, inbox_dir: Path):
        self._dir = inbox_dir

    def root(self) -> Path | None:
        return self._dir if self._dir.is_dir() else None

    def discover(self) -> Iterator[RawConversation]:
        root = self.root()
        if root is None:
            return

        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.name.startswith("."):
                continue

            if path.suffix == ".zip":
                yield from self._parse_zip(path)
            elif path.suffix == ".json":
                try:
                    yield from _parse_json(path.read_bytes(), str(path))
                except OSError:
                    continue
            elif path.suffix.lower() in TEXT_SUFFIXES:
                yield from _parse_text(path)

    def _parse_zip(self, path: Path) -> Iterator[RawConversation]:
        """Read an export archive in place - no unpacking into the filesystem."""
        try:
            with zipfile.ZipFile(io.BytesIO(path.read_bytes())) as archive:
                for member in archive.namelist():
                    if not member.endswith(".json") or member.startswith("__MACOSX"):
                        continue
                    try:
                        raw = archive.read(member)
                    except (KeyError, zipfile.BadZipFile):
                        continue
                    yield from _parse_json(raw, f"{path}!{member}")
        except (OSError, zipfile.BadZipFile):
            return
