"""Where things live, and the knobs that govern autonomy."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

# Autonomy tiers. The whole design hangs off these.
#
#   TIER_SILENT  - imports, indexing, tagging, dedupe detection. Just happens.
#   TIER_NOTIFY  - real changes to the vault, but low blast radius. Lands on a
#                  branch and auto-merges after AUTO_MERGE_HOURS unless Joe
#                  objects. Silence counts as yes.
#   TIER_HOLD    - overwrites current truth, marks things obsolete, merges
#                  duplicates, deletes, invents a new business area. Waits
#                  forever. Silence counts as nothing.
TIER_SILENT = 1
TIER_NOTIFY = 2
TIER_HOLD = 3

TIER_NAMES = {TIER_SILENT: "silent", TIER_NOTIFY: "notify", TIER_HOLD: "hold"}

AUTO_MERGE_HOURS = 24

# Areas the vault starts with. New ones are TIER_HOLD - the system does not get
# to invent a business area on its own.
DEFAULT_AREAS = [
    "govcon",
    "software",
    "content",
    "operations",
    "sales",
    "finance",
    "admin",
]


@dataclass(frozen=True)
class Config:
    home: Path
    """Root of the SavvyHub install. Everything below is relative to it."""

    @property
    def vault(self) -> Path:
        """Git repo holding the knowledge itself. `main` is always the truth."""
        return self.home / "vault"

    @property
    def inbox(self) -> Path:
        """Drop zone. Drains automatically; should sit empty."""
        return self.home / "inbox"

    @property
    def archive(self) -> Path:
        """Original imports, content-hash named, never edited."""
        return self.home / "archive"

    @property
    def work(self) -> Path:
        """Git worktrees where proposals are built, so `vault` stays browsable."""
        return self.home / ".work"

    @property
    def system(self) -> Path:
        """Config that belongs to the install rather than the knowledge."""
        return self.home / "system"

    @property
    def db_path(self) -> Path:
        return self.home / "db" / "savvy.db"

    def roots(self) -> dict[str, str]:
        """Per-connector path overrides from system/sources.json.

        Transcript locations move between tool releases, and not everyone keeps
        them in the default place. Overriding a path should not mean editing
        source code.
        """
        path = self.system / "sources.json"
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return {}
        return {k: str(v) for k, v in data.items() if isinstance(v, str)}

    @property
    def log_dir(self) -> Path:
        return self.home / "logs"

    def dirs(self) -> list[Path]:
        return [
            self.home,
            self.vault,
            self.inbox,
            self.archive,
            self.work,
            self.db_path.parent,
            self.log_dir,
            self.system,
        ]


def load(home: str | os.PathLike[str] | None = None) -> Config:
    """Resolve the SavvyHub home directory.

    Explicit argument wins, then $SAVVYHUB_HOME, then ~/SavvyHub.
    """
    if home is None:
        home = os.environ.get("SAVVYHUB_HOME") or Path.home() / "SavvyHub"
    return Config(home=Path(home).expanduser().resolve())
