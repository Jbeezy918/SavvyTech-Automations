"""Turn imported conversations into proposed knowledge items.

Extraction is the step that actually changes the vault, so it never writes to
`main`. It opens a proposal per conversation and lets the tier rules decide
whether that lands on its own or waits for Joe.

The extractor is pluggable behind `Extractor`. The heuristic one below runs
today with no model at all; the Ollama-backed one drops in behind the same
interface once the local setup is pinned down. Everything downstream - the
proposal mechanics, dedupe, approval, learning signal - is identical either way.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from . import db, vault
from .config import Config

# Keyword routing. Deliberately crude and deliberately visible: every routing
# call it makes is recorded, so the decisions table can correct it later.
AREA_KEYWORDS = {
    "govcon": [
        "sam.gov", "solicitation", "rfq", "rfp", "contract", "naics",
        "government", "agency", "bid", "proposal", "set-aside", "cage code",
    ],
    "software": [
        "repo", "deploy", "bug", "api", "database", "refactor", "endpoint",
        "typescript", "python", "build", "test", "commit", "branch",
    ],
    "content": [
        "youtube", "video", "thumbnail", "script", "episode", "publish",
        "subscriber", "channel", "podcast", "reel",
    ],
    "sales": ["lead", "client", "pricing", "quote", "proposal sent", "outreach"],
    "finance": ["invoice", "revenue", "cost", "budget", "expense", "payment"],
    "operations": ["process", "workflow", "sop", "schedule", "automation"],
}

KIND_PATTERNS = [
    ("decision", re.compile(
        r"\b(we (?:decided|agreed|settled on)|let'?s go with|going with|"
        r"final(?:ised|ized)? on|the call is)\b", re.I)),
    ("action_item", re.compile(
        r"\b(need to|needs to|todo|to-do|next step|i'?ll |we'?ll |"
        r"action item|follow up)\b", re.I)),
    ("opportunity", re.compile(
        r"\b(opportunity|new client|potential contract|lead on|might be able to win)\b", re.I)),
    ("upgrade", re.compile(
        r"\b(we should (?:add|build|upgrade)|would be better if|improvement:|"
        r"could automate)\b", re.I)),
    ("idea", re.compile(r"\b(what if|idea:|thinking about|concept:)\b", re.I)),
]

MIN_LEN = 40
MAX_LEN = 600


@dataclass
class Candidate:
    kind: str
    title: str
    body: str
    area: str
    confidence: float
    excerpt: str = ""
    project: str | None = None

    def content_hash(self) -> str:
        norm = " ".join(self.body.lower().split())
        return hashlib.sha256(f"{self.kind}:{norm}".encode()).hexdigest()


class Extractor(Protocol):
    name: str

    def extract(self, convo: dict) -> list[Candidate]: ...


def route_area(text: str) -> tuple[str, float]:
    """Pick an area by keyword weight. Ties and blanks land in needs-review."""
    lowered = text.lower()
    scores = {
        area: sum(lowered.count(kw) for kw in words)
        for area, words in AREA_KEYWORDS.items()
    }
    best = max(scores, key=lambda a: scores[a])
    total = sum(scores.values())
    if total == 0:
        return "admin", 0.2
    return best, min(0.95, 0.4 + 0.5 * scores[best] / total)


class HeuristicExtractor:
    """Pattern-matching extractor. No model, no network, works today."""

    name = "heuristic"

    def extract(self, convo: dict) -> list[Candidate]:
        found: list[Candidate] = []
        seen: set[str] = set()

        for turn in convo.get("turns", []):
            text = turn.get("text") or ""
            for sentence in re.split(r"(?<=[.!?\n])\s+", text):
                sentence = sentence.strip()
                if not (MIN_LEN <= len(sentence) <= MAX_LEN):
                    continue

                kind = next(
                    (k for k, pattern in KIND_PATTERNS if pattern.search(sentence)),
                    None,
                )
                if kind is None:
                    continue

                area, confidence = route_area(sentence + " " + convo.get("title", ""))
                candidate = Candidate(
                    kind=kind,
                    title=" ".join(sentence.split())[:100],
                    body=sentence,
                    area=area,
                    confidence=round(confidence, 2),
                    excerpt=sentence[:280],
                )
                key = candidate.content_hash()
                if key not in seen:
                    seen.add(key)
                    found.append(candidate)

        return found


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"


def _markdown(candidate: Candidate, convo: dict, conversation_id: int) -> str:
    """Front matter carries provenance so no item is ever orphaned from its source."""
    return (
        "---\n"
        f"kind: {candidate.kind}\n"
        f"area: {candidate.area}\n"
        f"confidence: {candidate.confidence}\n"
        f"source_conversation: {conversation_id}\n"
        f"source_title: {json.dumps(convo.get('title', ''))}\n"
        f"source_model: {convo.get('model') or 'unknown'}\n"
        f"extractor: heuristic\n"
        "---\n\n"
        f"# {candidate.title}\n\n"
        f"{candidate.body}\n\n"
        "## Source\n\n"
        f"From _{convo.get('title', 'untitled')}_ "
        f"({convo.get('model') or 'unknown'}).\n"
    )


def _already_known(conn: sqlite3.Connection, content_hash: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM items WHERE content_hash = ? AND status != 'rejected'",
        (content_hash,),
    ).fetchone()
    return row is not None


def extract_pending(
    cfg: Config,
    conn: sqlite3.Connection,
    extractor: Extractor | None = None,
    limit: int = 25,
) -> list[dict]:
    """Extract from conversations not yet processed, one proposal each."""
    extractor = extractor or HeuristicExtractor()
    rows = conn.execute(
        """
        SELECT id, title, archive_path FROM conversations
         WHERE extracted_at IS NULL
         ORDER BY imported_at
         LIMIT ?
        """,
        (limit,),
    ).fetchall()

    summaries: list[dict] = []
    for row in rows:
        archive = Path(row["archive_path"])
        try:
            convo = json.loads(archive.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            conn.execute(
                "UPDATE conversations SET extracted_at = datetime('now') WHERE id = ?",
                (row["id"],),
            )
            db.log(conn, "extract.unreadable", str(archive))
            continue

        fresh = [
            c for c in extractor.extract(convo)
            if not _already_known(conn, c.content_hash())
        ]

        if not fresh:
            conn.execute(
                "UPDATE conversations SET extracted_at = datetime('now') WHERE id = ?",
                (row["id"],),
            )
            continue

        title = f"Extract {len(fresh)} item(s) from {row['title'][:60]}"
        rationale = (
            f"{extractor.name} extractor over conversation {row['id']}.\n"
            + "\n".join(f"- [{c.kind}/{c.area}] {c.title}" for c in fresh)
        )

        # Any single low-confidence candidate holds the whole proposal for
        # review. Blast radius is judged by the weakest part of the change.
        tier = vault.TIER_HOLD if any(c.confidence < 0.5 for c in fresh) else vault.TIER_NOTIFY

        with vault.propose(cfg, conn, title, tier, rationale) as proposal:
            for candidate in fresh:
                # Hash suffix keeps two similarly-worded candidates from
                # colliding on one path and silently losing an item.
                digest = candidate.content_hash()
                relpath = (
                    f"{candidate.area}/{candidate.project or 'general'}/"
                    f"{candidate.kind}/{_slug(candidate.title)}-{digest[:8]}.md"
                )
                proposal.write(relpath, _markdown(candidate, convo, int(row["id"])))

                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO items
                        (kind, title, vault_path, area, project, status, confidence, content_hash)
                    VALUES (?, ?, ?, ?, ?, 'proposed', ?, ?)
                    """,
                    (
                        candidate.kind,
                        candidate.title,
                        relpath,
                        candidate.area,
                        candidate.project,
                        candidate.confidence,
                        digest,
                    ),
                )
                if cur.rowcount:
                    item_id = int(cur.lastrowid)
                    conn.execute(
                        "INSERT OR IGNORE INTO item_sources (item_id, conversation_id, excerpt) VALUES (?, ?, ?)",
                        (item_id, int(row["id"]), candidate.excerpt),
                    )
                    # Written here, not after the fact: propose() backfills any
                    # remaining paths with INSERT OR IGNORE, so this link wins
                    # and approval can promote the item to current truth.
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO proposal_items
                            (proposal_id, item_id, vault_path, change)
                        VALUES (?, ?, ?, 'add')
                        """,
                        (proposal.id, item_id, relpath),
                    )

        conn.execute(
            "UPDATE conversations SET extracted_at = datetime('now') WHERE id = ?",
            (row["id"],),
        )
        summaries.append(
            {"conversation_id": int(row["id"]), "candidates": len(fresh), "tier": tier}
        )

    return summaries
