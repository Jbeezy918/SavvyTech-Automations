#!/usr/bin/env python3
"""
LLM Vault — your own private, local database of your AI conversations.

Drop your data exports from ChatGPT, Claude, and Gemini into a folder, run one
command, and every conversation lands in a single local SQLite file you own.
Search it, tag it by idea/plan, and file it however you like. No accounts, no
cloud, no dependencies — just Python's standard library.

Usage:
    python3 vault.py ingest <path>        # import an export file or a folder of them
    python3 vault.py list [--provider P]  # list conversations
    python3 vault.py search "keyword"     # full-text-ish search across everything
    python3 vault.py show <conv_id>       # print a whole conversation
    python3 vault.py tag <conv_id> <tag>  # file a conversation under an idea/plan
    python3 vault.py untag <conv_id> <tag>
    python3 vault.py tags                 # list all tags and counts
    python3 vault.py stats                # overview of what's in the vault

The database lives next to this script as vault.db (override with --db PATH).
"""

import argparse
import datetime as _dt
import glob
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(HERE, "vault.db")


# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
    id          INTEGER PRIMARY KEY,
    provider    TEXT NOT NULL,
    filename    TEXT NOT NULL,
    imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY,
    provider      TEXT NOT NULL,
    ext_id        TEXT,
    title         TEXT,
    created_at    TEXT,
    updated_at    TEXT,
    message_count INTEGER DEFAULT 0,
    UNIQUE(provider, ext_id)
);
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,
    role            TEXT,
    text            TEXT,
    created_at      TEXT
);
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_text ON messages(text);
"""


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _iso(value):
    """Best-effort convert a timestamp (epoch seconds or ISO string) to ISO text."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        try:
            return _dt.datetime.utcfromtimestamp(value).isoformat()
        except (OSError, OverflowError, ValueError):
            return None
    return str(value)


def _text_from_parts(parts):
    """Flatten a list of content parts (strings or dicts) into plain text."""
    out = []
    for p in parts or []:
        if isinstance(p, str):
            out.append(p)
        elif isinstance(p, dict):
            # ChatGPT multimodal / Claude content blocks
            if "text" in p and isinstance(p["text"], str):
                out.append(p["text"])
            elif p.get("content_type") == "text" and isinstance(p.get("parts"), list):
                out.append(_text_from_parts(p["parts"]))
    return "\n".join(t for t in out if t)


# ─────────────────────────────────────────────────────────────────────────────
# Parsers — each yields dicts: {ext_id, title, created_at, updated_at, messages}
# where messages is a list of {role, text, created_at}
# ─────────────────────────────────────────────────────────────────────────────
def parse_chatgpt(data):
    """OpenAI/ChatGPT 'conversations.json' — tree of message nodes per convo."""
    for convo in data:
        mapping = convo.get("mapping") or {}
        nodes = []
        for node in mapping.values():
            msg = node.get("message")
            if not msg:
                continue
            author = (msg.get("author") or {}).get("role")
            if author not in ("user", "assistant"):
                continue
            content = msg.get("content") or {}
            if content.get("content_type") == "text":
                text = _text_from_parts(content.get("parts"))
            else:
                text = _text_from_parts(content.get("parts")) or ""
            if not text.strip():
                continue
            nodes.append((msg.get("create_time") or 0,
                          "user" if author == "user" else "assistant",
                          text, _iso(msg.get("create_time"))))
        nodes.sort(key=lambda n: n[0])
        yield {
            "ext_id": convo.get("conversation_id") or convo.get("id"),
            "title": convo.get("title") or "(untitled)",
            "created_at": _iso(convo.get("create_time")),
            "updated_at": _iso(convo.get("update_time")),
            "messages": [{"role": r, "text": t, "created_at": c} for _, r, t, c in nodes],
        }


def parse_claude(data):
    """Anthropic/Claude 'conversations.json' — flat chat_messages per convo."""
    for convo in data:
        msgs = []
        for m in convo.get("chat_messages") or []:
            sender = m.get("sender")
            role = "user" if sender == "human" else "assistant"
            text = m.get("text") or _text_from_parts(m.get("content"))
            if not (text or "").strip():
                continue
            msgs.append({"role": role, "text": text, "created_at": _iso(m.get("created_at"))})
        yield {
            "ext_id": convo.get("uuid") or convo.get("id"),
            "title": convo.get("name") or "(untitled)",
            "created_at": _iso(convo.get("created_at")),
            "updated_at": _iso(convo.get("updated_at")),
            "messages": msgs,
        }


def parse_gemini(data):
    """Google Takeout 'My Activity' JSON for Gemini — best-effort (prompts only)."""
    # Takeout groups everything into one activity stream; we treat each prompt as
    # a one-message conversation. It's coarser than ChatGPT/Claude but still yours.
    for i, item in enumerate(data):
        title = item.get("title") or ""
        # Strip the common "Prompted " / "Asked " prefixes Takeout adds.
        for prefix in ("Prompted ", "Asked "):
            if title.startswith(prefix):
                title = title[len(prefix):]
        if not title.strip():
            continue
        yield {
            "ext_id": f"{item.get('time','')}-{i}",
            "title": title[:120],
            "created_at": _iso(item.get("time")),
            "updated_at": _iso(item.get("time")),
            "messages": [{"role": "user", "text": title, "created_at": _iso(item.get("time"))}],
        }


PARSERS = {"chatgpt": parse_chatgpt, "claude": parse_claude, "gemini": parse_gemini}


def detect_provider(data, filename):
    """Guess the provider from the JSON shape or the file path."""
    fn = filename.lower()
    if "gemini" in fn or "myactivity" in fn or "my activity" in fn:
        return "gemini"
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            if "mapping" in first:
                return "chatgpt"
            if "chat_messages" in first or ("uuid" in first and "name" in first):
                return "claude"
            if "header" in first and "title" in first:
                return "gemini"
    if "chatgpt" in fn or "openai" in fn:
        return "chatgpt"
    if "claude" in fn or "anthropic" in fn:
        return "claude"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Ingest
# ─────────────────────────────────────────────────────────────────────────────
def ingest_file(conn, path, provider=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  ! skipped {path}: {e}")
        return 0, 0
    prov = provider or detect_provider(data, path)
    if prov not in PARSERS:
        print(f"  ! skipped {path}: couldn't tell which LLM this is "
              f"(try: python3 vault.py ingest {path} --provider chatgpt|claude|gemini)")
        return 0, 0

    cur = conn.cursor()
    cur.execute("INSERT INTO sources(provider, filename, imported_at) VALUES (?,?,?)",
                (prov, os.path.basename(path), _dt.datetime.utcnow().isoformat()))
    convos = 0
    msgs = 0
    for c in PARSERS[prov](data):
        if not c["messages"]:
            continue
        cur.execute(
            "INSERT INTO conversations(provider, ext_id, title, created_at, updated_at, message_count) "
            "VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(provider, ext_id) DO UPDATE SET "
            "title=excluded.title, updated_at=excluded.updated_at, "
            "message_count=excluded.message_count",
            (prov, c["ext_id"], c["title"], c["created_at"], c["updated_at"], len(c["messages"])),
        )
        cur.execute("SELECT id FROM conversations WHERE provider=? AND ext_id=?",
                    (prov, c["ext_id"]))
        conv_id = cur.fetchone()[0]
        # Replace messages so re-importing an updated export stays clean.
        cur.execute("DELETE FROM messages WHERE conversation_id=?", (conv_id,))
        for seq, m in enumerate(c["messages"]):
            cur.execute(
                "INSERT INTO messages(conversation_id, seq, role, text, created_at) "
                "VALUES (?,?,?,?,?)",
                (conv_id, seq, m["role"], m["text"], m["created_at"]),
            )
            msgs += 1
        convos += 1
    conn.commit()
    print(f"  ✓ {os.path.basename(path)} [{prov}]: {convos} conversations, {msgs} messages")
    return convos, msgs


def cmd_ingest(conn, args):
    path = args.path
    targets = []
    if os.path.isdir(path):
        for pat in ("*.json", "**/*.json"):
            targets.extend(glob.glob(os.path.join(path, pat), recursive=True))
        targets = sorted(set(targets))
        if not targets:
            print(f"No .json files found under {path}")
            return
    else:
        targets = [path]
    print(f"Ingesting {len(targets)} file(s)…")
    tc = tm = 0
    for t in targets:
        c, m = ingest_file(conn, t, args.provider)
        tc += c
        tm += m
    print(f"\nDone. {tc} conversations, {tm} messages now in the vault.")


# ─────────────────────────────────────────────────────────────────────────────
# Read commands
# ─────────────────────────────────────────────────────────────────────────────
def cmd_list(conn, args):
    q = ("SELECT c.id, c.provider, c.title, c.created_at, c.message_count, "
         "GROUP_CONCAT(t.name, ', ') AS tags "
         "FROM conversations c "
         "LEFT JOIN conversation_tags ct ON ct.conversation_id=c.id "
         "LEFT JOIN tags t ON t.id=ct.tag_id ")
    params = []
    if args.provider:
        q += "WHERE c.provider=? "
        params.append(args.provider)
    q += "GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?"
    params.append(args.limit)
    rows = conn.execute(q, params).fetchall()
    if not rows:
        print("Vault is empty — run:  python3 vault.py ingest llm-vault/exports")
        return
    for r in rows:
        tags = f"  #{r['tags']}" if r["tags"] else ""
        date = (r["created_at"] or "")[:10]
        print(f"[{r['id']:>4}] {r['provider']:<8} {date}  {r['title'][:64]}"
              f"  ({r['message_count']} msgs){tags}")


def cmd_search(conn, args):
    like = f"%{args.query}%"
    rows = conn.execute(
        "SELECT DISTINCT c.id, c.provider, c.title, c.created_at "
        "FROM conversations c JOIN messages m ON m.conversation_id=c.id "
        "WHERE m.text LIKE ? OR c.title LIKE ? "
        "ORDER BY c.created_at DESC LIMIT ?",
        (like, like, args.limit),
    ).fetchall()
    if not rows:
        print(f"No matches for '{args.query}'.")
        return
    print(f"{len(rows)} conversation(s) mention '{args.query}':\n")
    for r in rows:
        # show one matching snippet
        m = conn.execute(
            "SELECT text FROM messages WHERE conversation_id=? AND text LIKE ? LIMIT 1",
            (r["id"], like),
        ).fetchone()
        snippet = ""
        if m:
            t = " ".join(m["text"].split())
            idx = t.lower().find(args.query.lower())
            start = max(0, idx - 40)
            snippet = ("…" if start else "") + t[start:idx + len(args.query) + 60] + "…"
        print(f"[{r['id']:>4}] {r['provider']:<8} {(r['created_at'] or '')[:10]}  {r['title'][:60]}")
        if snippet:
            print(f"        {snippet}")


def cmd_show(conn, args):
    c = conn.execute("SELECT * FROM conversations WHERE id=?", (args.conv_id,)).fetchone()
    if not c:
        print(f"No conversation with id {args.conv_id}")
        return
    print(f"═══ [{c['id']}] {c['title']} ({c['provider']}, {(c['created_at'] or '')[:10]}) ═══\n")
    for m in conn.execute("SELECT role, text FROM messages WHERE conversation_id=? ORDER BY seq",
                          (args.conv_id,)):
        who = "YOU" if m["role"] == "user" else "AI "
        print(f"{who} ▸ {m['text']}\n")


# ─────────────────────────────────────────────────────────────────────────────
# Tagging
# ─────────────────────────────────────────────────────────────────────────────
def _get_tag_id(conn, name):
    conn.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", (name,))
    return conn.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()[0]


def cmd_tag(conn, args):
    if not conn.execute("SELECT 1 FROM conversations WHERE id=?", (args.conv_id,)).fetchone():
        print(f"No conversation with id {args.conv_id}")
        return
    tag_id = _get_tag_id(conn, args.tag)
    conn.execute("INSERT OR IGNORE INTO conversation_tags(conversation_id, tag_id) VALUES (?,?)",
                 (args.conv_id, tag_id))
    conn.commit()
    print(f"Filed conversation {args.conv_id} under #{args.tag}")


def cmd_untag(conn, args):
    conn.execute(
        "DELETE FROM conversation_tags WHERE conversation_id=? AND "
        "tag_id=(SELECT id FROM tags WHERE name=?)",
        (args.conv_id, args.tag),
    )
    conn.commit()
    print(f"Removed #{args.tag} from conversation {args.conv_id}")


def cmd_tags(conn, args):
    rows = conn.execute(
        "SELECT t.name, COUNT(ct.conversation_id) AS n FROM tags t "
        "LEFT JOIN conversation_tags ct ON ct.tag_id=t.id "
        "GROUP BY t.id ORDER BY n DESC, t.name"
    ).fetchall()
    if not rows:
        print("No tags yet. File something:  python3 vault.py tag <conv_id> my-idea")
        return
    for r in rows:
        print(f"  #{r['name']:<24} {r['n']}")


def cmd_stats(conn, args):
    convos = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    print(f"Vault: {convos} conversations, {msgs} messages\n")
    for r in conn.execute("SELECT provider, COUNT(*) n FROM conversations GROUP BY provider ORDER BY n DESC"):
        print(f"  {r['provider']:<10} {r['n']}")
    span = conn.execute("SELECT MIN(created_at), MAX(created_at) FROM conversations "
                        "WHERE created_at IS NOT NULL").fetchone()
    if span and span[0]:
        print(f"\n  span: {span[0][:10]} → {span[1][:10]}")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def main(argv=None):
    p = argparse.ArgumentParser(description="LLM Vault — your private local AI-conversation database.")
    p.add_argument("--db", default=DEFAULT_DB, help="path to the vault database (default: vault.db)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("ingest", help="import an export file or a folder of them")
    s.add_argument("path")
    s.add_argument("--provider", choices=list(PARSERS), help="force the provider instead of auto-detecting")

    s = sub.add_parser("list", help="list conversations")
    s.add_argument("--provider", choices=list(PARSERS))
    s.add_argument("--limit", type=int, default=50)

    s = sub.add_parser("search", help="search across every message")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=25)

    s = sub.add_parser("show", help="print a whole conversation")
    s.add_argument("conv_id", type=int)

    s = sub.add_parser("tag", help="file a conversation under an idea/plan")
    s.add_argument("conv_id", type=int)
    s.add_argument("tag")

    s = sub.add_parser("untag", help="remove a tag from a conversation")
    s.add_argument("conv_id", type=int)
    s.add_argument("tag")

    sub.add_parser("tags", help="list all tags and counts")
    sub.add_parser("stats", help="overview of the vault")

    args = p.parse_args(argv)
    conn = connect(args.db)
    dispatch = {
        "ingest": cmd_ingest, "list": cmd_list, "search": cmd_search, "show": cmd_show,
        "tag": cmd_tag, "untag": cmd_untag, "tags": cmd_tags, "stats": cmd_stats,
    }
    dispatch[args.cmd](conn, args)
    conn.close()


if __name__ == "__main__":
    main()
