"""Connector registry.

Sources that are missing on this machine simply yield nothing - a connector for
a tool you do not use is not an error.
"""

from __future__ import annotations

from typing import Iterable

from ..config import Config
from .base import Connector, RawConversation, Turn
from .cli_transcripts import claude_code, codex
from .inbox import InboxConnector

__all__ = ["Connector", "RawConversation", "Turn", "all_connectors"]


def all_connectors(cfg: Config) -> Iterable[Connector]:
    overrides = cfg.roots()
    connectors = [claude_code(), codex()]
    for connector in connectors:
        override = overrides.get(connector.name)
        if override:
            connector.set_roots([override])
    return [*connectors, InboxConnector(cfg.inbox)]
