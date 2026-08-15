"""The daemon loop.

Two clocks, deliberately. A cheap filesystem poll keeps the index seconds
behind reality, so the dashboard is live rather than twelve hours stale. The
expensive work - extraction, and later the local model - runs on its own slower
schedule. Running both off one twice-daily timer is what would make the
dashboard feel dead.

Pure stdlib: no watchdog, no install step, nothing to break on a macOS upgrade.
"""

from __future__ import annotations

import signal
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from . import db, extract, ingest, vault
from .config import Config
from .connectors import all_connectors

WATCH_GLOBS = ("*.jsonl", "*.json", "*.zip", "*.md", "*.txt")


def signature(cfg: Config) -> tuple:
    """Cheap fingerprint of every watched file's (path, size, mtime)."""
    stamps: list[tuple[str, int, int]] = []
    roots = [c.root() for c in all_connectors(cfg)]

    for root in roots:
        if root is None:
            continue
        for pattern in WATCH_GLOBS:
            for path in root.rglob(pattern):
                try:
                    stat = path.stat()
                except OSError:
                    continue
                stamps.append((str(path), stat.st_size, int(stat.st_mtime)))

    return tuple(sorted(stamps))


@dataclass
class Loop:
    cfg: Config
    conn: sqlite3.Connection
    poll_seconds: int = 5
    extract_seconds: int = 300
    running: bool = True

    def stop(self, *_: object) -> None:
        self.running = False

    def run(self, once: bool = False) -> None:
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        last_sig = None
        last_extract = 0.0

        while self.running:
            now = time.monotonic()

            # Fast clock: anything changed on disk lands in the index at once.
            current = signature(self.cfg)
            if current != last_sig:
                last_sig = current
                results = ingest.scan(self.cfg, self.conn)
                imported = sum(r.imported for r in results)
                if imported:
                    db.log(self.conn, "watch.imported", detail=f"{imported} new")

            # Slow clock: extraction, and the auto-merge deadline sweep.
            if now - last_extract >= self.extract_seconds or last_extract == 0.0:
                last_extract = now
                extract.extract_pending(self.cfg, self.conn)
                merged = vault.tick(self.cfg, self.conn)
                if merged:
                    db.log(self.conn, "watch.auto_merged", detail=f"{len(merged)}")

            if once:
                return

            # Sleep in slices so Ctrl-C is felt immediately.
            for _ in range(self.poll_seconds * 2):
                if not self.running:
                    return
                time.sleep(0.5)


def run(cfg: Config, conn: sqlite3.Connection, once: bool = False, poll: int = 5) -> None:
    Loop(cfg=cfg, conn=conn, poll_seconds=poll).run(once=once)


def launchd_plist(cfg: Config, python: str, label: str = "com.savvytech.savvyhub") -> str:
    """A launchd job, because a daemon that dies on reboot is not a daemon."""
    module_root = Path(__file__).resolve().parent.parent
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python}</string>
        <string>-m</string>
        <string>savvyhub</string>
        <string>watch</string>
    </array>
    <key>WorkingDirectory</key><string>{module_root}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SAVVYHUB_HOME</key><string>{cfg.home}</string>
        <key>PYTHONPATH</key><string>{module_root}</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>{cfg.log_dir}/watch.out.log</string>
    <key>StandardErrorPath</key><string>{cfg.log_dir}/watch.err.log</string>
</dict>
</plist>
"""
