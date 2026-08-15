-- SavvyHub catalog.
--
-- Files in the vault hold the *content*. This database holds the *facts about*
-- that content: what state it is in, what it relates to, where it came from.
-- Those are separate axes, which is exactly why they are not both folders.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Every place conversations come from, and how honest we can be about coverage.
--   mode = 'live'   watcher sees it change, seconds behind
--   mode = 'export' needs a periodic manual export (Claude.ai, ChatGPT, Takeout)
--   mode = 'manual' someone drops it in the inbox (phone share sheet)
CREATE TABLE IF NOT EXISTS sources (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE,
    mode           TEXT NOT NULL CHECK (mode IN ('live', 'export', 'manual')),
    root_path      TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1,
    -- Staleness tracking. A source of truth that lies about its own
    -- completeness is worse than no source of truth.
    last_import_at TEXT,
    last_status    TEXT,
    stale_after_h  INTEGER NOT NULL DEFAULT 24,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per imported conversation. content_hash makes re-import idempotent:
-- re-dropping the same ChatGPT export ten times imports it once.
CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY,
    source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_id   TEXT,
    title         TEXT,
    model         TEXT,
    started_at    TEXT,
    ended_at      TEXT,
    turn_count    INTEGER NOT NULL DEFAULT 0,
    content_hash  TEXT NOT NULL,
    archive_path  TEXT NOT NULL,
    origin_path   TEXT,
    imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
    extracted_at  TEXT,
    UNIQUE (source_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_conv_source ON conversations(source_id);
CREATE INDEX IF NOT EXISTS idx_conv_pending ON conversations(extracted_at)
    WHERE extracted_at IS NULL;

-- Knowledge units. `status` and `area` are columns precisely because an item is
-- GovCon *and* proposed *and* linked to three projects, all at once.
CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN (
                      'note', 'decision', 'action_item', 'opportunity',
                      'idea', 'requirement', 'upgrade', 'sop')),
    title         TEXT NOT NULL,
    vault_path    TEXT NOT NULL UNIQUE,
    area          TEXT,
    project       TEXT,
    status        TEXT NOT NULL DEFAULT 'current' CHECK (status IN (
                      'current', 'proposed', 'needs_review',
                      'obsolete', 'rejected')),
    confidence    REAL,
    content_hash  TEXT,
    -- Nothing is deleted. Duplicates point at their canonical row; superseded
    -- items point at what replaced them. Both stay readable forever.
    dup_of        INTEGER REFERENCES items(id),
    superseded_by INTEGER REFERENCES items(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_area ON items(area, status);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project, status);
CREATE INDEX IF NOT EXISTS idx_items_hash ON items(content_hash);

-- Provenance: which conversations produced this item. Many-to-many, because a
-- decision usually accretes across several chats.
CREATE TABLE IF NOT EXISTS item_sources (
    item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    excerpt         TEXT,
    PRIMARY KEY (item_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS links (
    from_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    to_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    rel      TEXT NOT NULL,
    PRIMARY KEY (from_id, to_id, rel)
);

-- Copy-on-write. Every change to the vault is a git branch that has not landed
-- yet. `main` is untouched until a proposal is approved or auto-merges.
CREATE TABLE IF NOT EXISTS proposals (
    id            INTEGER PRIMARY KEY,
    branch        TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    rationale     TEXT,
    tier          INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                      'open', 'pending', 'approved', 'rejected',
                      'auto_merged', 'failed')),
    -- Set for tier 2 only. NULL means it waits for a human, forever.
    auto_merge_at TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at    TEXT,
    decided_by    TEXT,
    merge_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, auto_merge_at);

CREATE TABLE IF NOT EXISTS proposal_items (
    proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
    vault_path  TEXT NOT NULL,
    change      TEXT NOT NULL CHECK (change IN ('add', 'edit', 'supersede', 'merge')),
    PRIMARY KEY (proposal_id, vault_path)
);

-- Every approve/reject is a labelled example. This table is what lets routing
-- and thresholds tune themselves out of Joe's actual behaviour over time.
CREATE TABLE IF NOT EXISTS decisions (
    id          INTEGER PRIMARY KEY,
    proposal_id INTEGER REFERENCES proposals(id) ON DELETE SET NULL,
    verdict     TEXT NOT NULL CHECK (verdict IN ('approved', 'rejected', 'auto_merged')),
    tier        INTEGER,
    area        TEXT,
    kind        TEXT,
    confidence  REAL,
    note        TEXT,
    decided_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only. Never updated, never deleted.
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    subject    TEXT,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
