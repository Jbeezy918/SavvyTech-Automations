"""Copy-on-write vault.

The rule this module exists to enforce: the agent never edits current truth in
place. Every change is built on a branch, in its own git worktree, so that
`vault/` on `main` stays exactly as Joe left it and stays browsable the entire
time. Approving is a merge. Rejecting deletes a branch. The original is never
moved, so there is nothing to undo.
"""

from __future__ import annotations

import re
import shutil
import sqlite3
import subprocess
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from . import db
from .config import AUTO_MERGE_HOURS, DEFAULT_AREAS, TIER_HOLD, TIER_NOTIFY, Config


class VaultError(RuntimeError):
    pass


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
    )
    if check and proc.returncode != 0:
        raise VaultError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:48] or "change"


def ensure(cfg: Config) -> None:
    """Create the vault repo and its skeleton. Safe to run repeatedly."""
    for path in cfg.dirs():
        path.mkdir(parents=True, exist_ok=True)

    if not (cfg.vault / ".git").exists():
        git(cfg.vault, "init", "--initial-branch=main")
        # Local identity so commits work regardless of global git config.
        git(cfg.vault, "config", "user.name", "SavvyHub")
        git(cfg.vault, "config", "user.email", "savvyhub@localhost")

    for area in DEFAULT_AREAS:
        area_dir = cfg.vault / area
        area_dir.mkdir(exist_ok=True)
        keep = area_dir / ".gitkeep"
        if not keep.exists():
            keep.touch()

    readme = cfg.vault / "README.md"
    if not readme.exists():
        readme.write_text(
            "# Vault\n\n"
            "This branch (`main`) is current truth. Nothing writes to it directly.\n"
            "Proposed changes live on `proposal/*` branches until approved.\n"
        )

    if git(cfg.vault, "status", "--porcelain").stdout.strip():
        git(cfg.vault, "add", "-A")
        git(cfg.vault, "commit", "-m", "Initialise vault skeleton")


@dataclass
class Proposal:
    """A change under construction, living in its own worktree."""

    id: int
    branch: str
    tier: int
    worktree: Path

    def write(self, relpath: str, content: str) -> Path:
        """Write a file inside the proposal. Never touches `vault/` on main."""
        target = self.worktree / relpath
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return target


@contextmanager
def propose(
    cfg: Config,
    conn: sqlite3.Connection,
    title: str,
    tier: int,
    rationale: str = "",
) -> Iterator[Proposal]:
    """Open a proposal, yield a worktree to build it in, then commit it.

    Tier 2 proposals get an auto-merge deadline: silence counts as yes for
    low-risk changes, so nothing rots waiting on a busy week. Tier 3 gets no
    deadline at all - it waits for a human indefinitely.
    """
    ensure(cfg)

    cur = conn.execute(
        "INSERT INTO proposals (branch, title, rationale, tier, status) VALUES (?, ?, ?, ?, 'open')",
        ("", title, rationale, tier),
    )
    proposal_id = int(cur.lastrowid)
    branch = f"proposal/{_slug(title)}-{proposal_id}"
    conn.execute("UPDATE proposals SET branch = ? WHERE id = ?", (branch, proposal_id))

    worktree = cfg.work / f"p{proposal_id}"
    if worktree.exists():
        shutil.rmtree(worktree)
    git(cfg.vault, "worktree", "add", "-b", branch, str(worktree), "main")

    proposal = Proposal(id=proposal_id, branch=branch, tier=tier, worktree=worktree)
    try:
        yield proposal
    except Exception:
        _discard(cfg, conn, proposal_id, branch, worktree, status="failed")
        raise

    changed = git(worktree, "status", "--porcelain").stdout.strip()
    if not changed:
        # Nothing to propose. Don't leave an empty branch lying around.
        _discard(cfg, conn, proposal_id, branch, worktree, status="rejected")
        db.log(conn, "proposal.empty", title)
        return

    git(worktree, "add", "-A")
    git(worktree, "commit", "-m", f"{title}\n\n{rationale}".strip())

    for path in _changed_paths(worktree):
        conn.execute(
            "INSERT OR IGNORE INTO proposal_items (proposal_id, vault_path, change) VALUES (?, ?, ?)",
            (proposal_id, path, "add"),
        )

    auto_at = None
    if tier == TIER_NOTIFY:
        auto_at = (
            datetime.now(timezone.utc) + timedelta(hours=AUTO_MERGE_HOURS)
        ).strftime("%Y-%m-%d %H:%M:%S")

    conn.execute(
        "UPDATE proposals SET status = 'pending', auto_merge_at = ? WHERE id = ?",
        (auto_at, proposal_id),
    )
    db.log(conn, "proposal.opened", title, proposal_id=proposal_id, tier=tier, branch=branch)


def _changed_paths(worktree: Path) -> list[str]:
    out = git(worktree, "diff", "--name-only", "main...HEAD").stdout
    return [line for line in out.splitlines() if line.strip()]


def _discard(
    cfg: Config,
    conn: sqlite3.Connection,
    proposal_id: int,
    branch: str,
    worktree: Path,
    status: str,
) -> None:
    _drop_worktree(cfg, worktree)
    if branch:
        git(cfg.vault, "branch", "-D", branch, check=False)
    conn.execute(
        "UPDATE proposals SET status = ?, decided_at = datetime('now') WHERE id = ?",
        (status, proposal_id),
    )


def _drop_worktree(cfg: Config, worktree: Path) -> None:
    git(cfg.vault, "worktree", "remove", "--force", str(worktree), check=False)
    if worktree.exists():
        shutil.rmtree(worktree, ignore_errors=True)
    git(cfg.vault, "worktree", "prune", check=False)


def pending(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.*,
               (SELECT COUNT(*) FROM proposal_items pi WHERE pi.proposal_id = p.id) AS file_count,
               CASE WHEN p.auto_merge_at IS NULL THEN NULL
                    ELSE ROUND((julianday(p.auto_merge_at) - julianday('now')) * 24, 1)
               END AS hours_left
          FROM proposals p
         WHERE p.status = 'pending'
         ORDER BY p.tier DESC, p.created_at
        """
    ).fetchall()
    return [dict(r) for r in rows]


def diff(cfg: Config, branch: str) -> str:
    return git(cfg.vault, "diff", f"main...{branch}").stdout


def decide(
    cfg: Config,
    conn: sqlite3.Connection,
    proposal_id: int,
    verdict: str,
    by: str = "joe",
    note: str = "",
) -> dict:
    """Approve (merge) or reject (drop the branch) a pending proposal."""
    row = conn.execute(
        "SELECT * FROM proposals WHERE id = ? AND status = 'pending'", (proposal_id,)
    ).fetchone()
    if row is None:
        raise VaultError(f"no pending proposal {proposal_id}")

    branch = row["branch"]
    worktree = cfg.work / f"p{proposal_id}"

    if verdict == "rejected":
        _discard(cfg, conn, proposal_id, branch, worktree, status="rejected")
    else:
        # Release the worktree first: a branch checked out elsewhere cannot merge.
        _drop_worktree(cfg, worktree)
        merge = git(
            cfg.vault, "merge", "--no-ff", "--no-edit", branch, check=False
        )
        if merge.returncode != 0:
            git(cfg.vault, "merge", "--abort", check=False)
            conn.execute(
                "UPDATE proposals SET status = 'failed', merge_error = ? WHERE id = ?",
                (merge.stderr.strip()[:500], proposal_id),
            )
            db.log(conn, "proposal.conflict", row["title"], proposal_id=proposal_id)
            return {"ok": False, "error": "merge conflict", "proposal_id": proposal_id}

        git(cfg.vault, "branch", "-d", branch, check=False)
        conn.execute(
            "UPDATE proposals SET status = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?",
            (verdict, by, proposal_id),
        )

    # Items follow their proposal: landed changes become current truth, dropped
    # ones are marked rejected rather than deleted so they never resurface as
    # "new" on a later scan.
    item_status = "rejected" if verdict == "rejected" else "current"
    conn.execute(
        """
        UPDATE items SET status = ?, updated_at = datetime('now')
         WHERE id IN (SELECT item_id FROM proposal_items
                       WHERE proposal_id = ? AND item_id IS NOT NULL)
        """,
        (item_status, proposal_id),
    )

    # Every decision is a labelled example. This is the training signal that
    # lets routing and thresholds tune themselves out of real behaviour.
    conn.execute(
        "INSERT INTO decisions (proposal_id, verdict, tier, note) VALUES (?, ?, ?, ?)",
        (proposal_id, verdict, row["tier"], note),
    )
    db.log(conn, f"proposal.{verdict}", row["title"], proposal_id=proposal_id, by=by)
    return {"ok": True, "proposal_id": proposal_id, "verdict": verdict}


def tick(cfg: Config, conn: sqlite3.Connection) -> list[dict]:
    """Land tier-2 proposals whose deadline has passed.

    This is the valve that makes the system hands-off: low-risk changes do not
    need Joe to say yes, only to not say no. Tier 3 never appears here.
    """
    due = conn.execute(
        """
        SELECT id FROM proposals
         WHERE status = 'pending'
           AND tier = ?
           AND auto_merge_at IS NOT NULL
           AND datetime(auto_merge_at) <= datetime('now')
         ORDER BY created_at
        """,
        (TIER_NOTIFY,),
    ).fetchall()
    return [
        decide(cfg, conn, int(r["id"]), "auto_merged", by="auto") for r in due
    ]


def guard_tier(kind: str) -> int:
    """Blast radius decides the tier, not the model's confidence in itself."""
    destructive = {"supersede", "merge", "delete", "new_area", "overwrite"}
    return TIER_HOLD if kind in destructive else TIER_NOTIFY
