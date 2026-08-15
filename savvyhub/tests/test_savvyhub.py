"""End-to-end tests. Stdlib unittest so there is nothing to install."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from savvyhub import config, dashboard, db, extract, ingest, vault
from savvyhub.connectors import cli_transcripts, inbox
from savvyhub.connectors.base import RawConversation, Turn


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name) / "SavvyHub"
        self.cfg = config.load(self.home)

        # Isolate from any real transcripts on the machine running the tests,
        # otherwise the suite silently ingests the developer's own history.
        self.fake_roots = Path(self._tmp.name) / "roots"
        self.cfg.system.mkdir(parents=True, exist_ok=True)
        (self.cfg.system / "sources.json").write_text(
            json.dumps({
                "claude-code": str(self.fake_roots / "claude"),
                "codex": str(self.fake_roots / "codex"),
            })
        )

        self.conn = db.connect(self.cfg.db_path)
        db.init(self.conn)
        vault.ensure(self.cfg)
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(self.conn.close)


class VaultTests(Base):
    def test_main_untouched_while_proposal_open(self) -> None:
        """The whole promise: the original never moves until you say so."""
        with vault.propose(self.cfg, self.conn, "Add a note", vault.TIER_HOLD) as p:
            p.write("govcon/general/note/x.md", "hello")
            self.assertTrue((p.worktree / "govcon/general/note/x.md").exists())
            self.assertFalse((self.cfg.vault / "govcon/general/note/x.md").exists())

        # Still absent after the proposal is committed - it is pending, not merged.
        self.assertFalse((self.cfg.vault / "govcon/general/note/x.md").exists())
        self.assertEqual(len(vault.pending(self.conn)), 1)

    def test_approve_merges_into_main(self) -> None:
        with vault.propose(self.cfg, self.conn, "Add a note", vault.TIER_HOLD) as p:
            p.write("govcon/general/note/x.md", "hello")

        pid = vault.pending(self.conn)[0]["id"]
        self.assertIn("hello", vault.diff(self.cfg, f"proposal/add-a-note-{pid}"))

        result = vault.decide(self.cfg, self.conn, pid, "approved")
        self.assertTrue(result["ok"])
        self.assertEqual((self.cfg.vault / "govcon/general/note/x.md").read_text(), "hello")
        self.assertEqual(vault.pending(self.conn), [])

    def test_reject_leaves_no_trace(self) -> None:
        with vault.propose(self.cfg, self.conn, "Bad idea", vault.TIER_HOLD) as p:
            p.write("govcon/general/note/y.md", "nope")

        pid = vault.pending(self.conn)[0]["id"]
        vault.decide(self.cfg, self.conn, pid, "rejected")

        self.assertFalse((self.cfg.vault / "govcon/general/note/y.md").exists())
        branches = vault.git(self.cfg.vault, "branch", "--list").stdout
        self.assertNotIn("proposal/", branches)

    def test_tier_two_auto_merges_when_due(self) -> None:
        with vault.propose(self.cfg, self.conn, "Routine note", vault.TIER_NOTIFY) as p:
            p.write("software/general/note/z.md", "auto")

        pid = vault.pending(self.conn)[0]["id"]
        self.assertEqual(vault.tick(self.cfg, self.conn), [], "not due yet")

        # Wind the deadline back into the past.
        self.conn.execute(
            "UPDATE proposals SET auto_merge_at = datetime('now', '-1 hour') WHERE id = ?",
            (pid,),
        )
        merged = vault.tick(self.cfg, self.conn)

        self.assertEqual(len(merged), 1)
        self.assertTrue((self.cfg.vault / "software/general/note/z.md").exists())

    def test_tier_three_never_auto_merges(self) -> None:
        """Silence must never be consent for a destructive change."""
        with vault.propose(self.cfg, self.conn, "Destructive", vault.TIER_HOLD) as p:
            p.write("govcon/general/note/w.md", "risky")

        self.conn.execute(
            "UPDATE proposals SET auto_merge_at = datetime('now', '-99 hours')"
        )
        self.assertEqual(vault.tick(self.cfg, self.conn), [])
        self.assertEqual(len(vault.pending(self.conn)), 1)

    def test_empty_proposal_is_discarded(self) -> None:
        with vault.propose(self.cfg, self.conn, "Nothing", vault.TIER_NOTIFY):
            pass
        self.assertEqual(vault.pending(self.conn), [])

    def test_decision_recorded_as_learning_signal(self) -> None:
        with vault.propose(self.cfg, self.conn, "Note", vault.TIER_HOLD) as p:
            p.write("finance/general/note/a.md", "x")
        pid = vault.pending(self.conn)[0]["id"]
        vault.decide(self.cfg, self.conn, pid, "rejected", note="wrong area")

        row = self.conn.execute("SELECT verdict, note FROM decisions").fetchone()
        self.assertEqual(row["verdict"], "rejected")
        self.assertEqual(row["note"], "wrong area")

    def test_guard_tier_holds_destructive_kinds(self) -> None:
        self.assertEqual(vault.guard_tier("supersede"), vault.TIER_HOLD)
        self.assertEqual(vault.guard_tier("new_area"), vault.TIER_HOLD)
        self.assertEqual(vault.guard_tier("note"), vault.TIER_NOTIFY)


class ConnectorTests(Base):
    def test_claude_code_transcript_parsed(self) -> None:
        root = Path(self._tmp.name) / "projects" / "demo"
        root.mkdir(parents=True)
        lines = [
            {"type": "user", "message": {"content": "Fix the deploy script"},
             "timestamp": "2026-08-01T10:00:00Z"},
            {"type": "assistant", "model": "claude-opus-5",
             "message": {"content": [{"type": "text", "text": "On it."}]}},
            {"type": "summary", "summary": "ignored"},
            "{ not json",
        ]
        (root / "s1.jsonl").write_text(
            "\n".join(json.dumps(l) if isinstance(l, dict) else l for l in lines)
        )

        connector = cli_transcripts.JsonlTranscriptConnector("claude-code", [str(root.parent)])
        convos = list(connector.discover())

        self.assertEqual(len(convos), 1)
        self.assertEqual(len(convos[0].turns), 2, "metadata and bad lines skipped")
        self.assertEqual(convos[0].model, "claude-opus-5")
        self.assertIn("Fix the deploy", convos[0].title)

    def test_chatgpt_export_parsed_from_inbox(self) -> None:
        payload = [{
            "id": "abc",
            "title": "Pricing chat",
            "mapping": {
                "1": {"message": {"author": {"role": "user"}, "create_time": 1,
                                  "content": {"parts": ["What should we charge?"]}}},
                "2": {"message": {"author": {"role": "assistant"}, "create_time": 2,
                                  "content": {"parts": ["Depends on scope."]}}},
                "3": {"message": {"author": {"role": "system"}, "create_time": 0,
                                  "content": {"parts": [""]}}},
            },
        }]
        self.cfg.inbox.mkdir(parents=True, exist_ok=True)
        (self.cfg.inbox / "conversations.json").write_text(json.dumps(payload))

        convos = list(inbox.InboxConnector(self.cfg.inbox).discover())
        self.assertEqual(len(convos), 1)
        self.assertEqual(len(convos[0].turns), 2)
        self.assertEqual(convos[0].title, "Pricing chat")

    def test_claude_ai_export_parsed(self) -> None:
        payload = [{
            "uuid": "u1", "name": "GovCon plan",
            "chat_messages": [
                {"sender": "human", "text": "We need a SAM.gov strategy"},
                {"sender": "assistant", "text": "Here is one."},
            ],
        }]
        self.cfg.inbox.mkdir(parents=True, exist_ok=True)
        (self.cfg.inbox / "claude.json").write_text(json.dumps(payload))

        convos = list(inbox.InboxConnector(self.cfg.inbox).discover())
        self.assertEqual(convos[0].model, "claude")
        self.assertEqual(convos[0].turns[0].role, "user")

    def test_content_hash_is_stable_and_distinct(self) -> None:
        a = RawConversation("1", "t", [Turn("user", "hello")])
        b = RawConversation("1", "different title", [Turn("user", "hello")])
        c = RawConversation("1", "t", [Turn("user", "goodbye")])

        self.assertEqual(a.content_hash(), b.content_hash(), "title is not content")
        self.assertNotEqual(a.content_hash(), c.content_hash())


class IngestTests(Base):
    def _drop_export(self, text: str, name: str = "conversations.json") -> None:
        self.cfg.inbox.mkdir(parents=True, exist_ok=True)
        (self.cfg.inbox / name).write_text(json.dumps([{
            "uuid": "u1", "name": "Chat",
            "chat_messages": [{"sender": "human", "text": text}],
        }]))

    def test_rescan_does_not_duplicate(self) -> None:
        self._drop_export("We decided to go with the Cloudflare deployment for the retreat site.")

        first = {r.source: r for r in ingest.scan(self.cfg, self.conn)}["inbox"]
        second = {r.source: r for r in ingest.scan(self.cfg, self.conn)}["inbox"]

        self.assertEqual(first.imported, 1)
        self.assertEqual(second.imported, 0)
        self.assertEqual(second.skipped, 1)
        self.assertEqual(db.counts(self.conn)["conversations"], 1)

    def test_original_archived_untouched(self) -> None:
        self._drop_export("We decided to go with weekly GovCon solicitation reviews.")
        ingest.scan(self.cfg, self.conn)

        row = self.conn.execute("SELECT archive_path FROM conversations").fetchone()
        stored = json.loads(Path(row["archive_path"]).read_text())
        self.assertIn("GovCon", stored["turns"][0]["text"])
        self.assertTrue((self.cfg.inbox / "conversations.json").exists(), "source not moved")

    def test_missing_source_is_reported_not_fatal(self) -> None:
        results = {r.source: r for r in ingest.scan(self.cfg, self.conn)}
        self.assertIn("claude-code", results)
        health = {s["name"]: s for s in db.source_health(self.conn)}
        self.assertEqual(health["claude-code"]["stale"], 1, "never imported reads as stale")


class ExtractTests(Base):
    def _ingest(self, text: str) -> None:
        self.cfg.inbox.mkdir(parents=True, exist_ok=True)
        (self.cfg.inbox / "c.json").write_text(json.dumps([{
            "uuid": "u1", "name": "Planning",
            "chat_messages": [{"sender": "human", "text": text}],
        }]))
        ingest.scan(self.cfg, self.conn)

    def test_extraction_creates_a_pending_proposal(self) -> None:
        self._ingest(
            "We decided to go with the SAM.gov solicitation tracker for the "
            "government contract pipeline this quarter."
        )
        results = extract.extract_pending(self.cfg, self.conn)

        self.assertEqual(len(results), 1)
        pending = vault.pending(self.conn)
        self.assertEqual(len(pending), 1)
        item = self.conn.execute("SELECT area, kind, status FROM items").fetchone()
        self.assertEqual(item["area"], "govcon")
        self.assertEqual(item["kind"], "decision")
        self.assertEqual(item["status"], "proposed", "not truth until approved")

    def test_approving_promotes_items_to_current(self) -> None:
        self._ingest("We decided to refactor the deploy api endpoint before the next build.")
        extract.extract_pending(self.cfg, self.conn)
        pid = vault.pending(self.conn)[0]["id"]
        vault.decide(self.cfg, self.conn, pid, "approved")

        item = self.conn.execute("SELECT status, vault_path FROM items").fetchone()
        self.assertEqual(item["status"], "current")
        self.assertTrue((self.cfg.vault / item["vault_path"]).exists())

    def test_second_pass_does_not_re_propose(self) -> None:
        self._ingest("We decided to go with weekly youtube video scripts for the channel.")
        extract.extract_pending(self.cfg, self.conn)
        self.assertEqual(extract.extract_pending(self.cfg, self.conn), [])

    def test_low_confidence_is_held_for_review(self) -> None:
        self._ingest("We decided to think about that thing we mentioned the other day.")
        extract.extract_pending(self.cfg, self.conn)
        pending = vault.pending(self.conn)
        self.assertTrue(pending)
        self.assertEqual(pending[0]["tier"], vault.TIER_HOLD)
        self.assertIsNone(pending[0]["auto_merge_at"])

    def test_provenance_is_recorded(self) -> None:
        self._ingest("We decided to go with the Cloudflare deploy for the software repo build.")
        extract.extract_pending(self.cfg, self.conn)
        row = self.conn.execute(
            "SELECT COUNT(*) AS n FROM item_sources"
        ).fetchone()
        self.assertGreater(row["n"], 0)

    def test_area_routing(self) -> None:
        self.assertEqual(extract.route_area("sam.gov solicitation naics")[0], "govcon")
        self.assertEqual(extract.route_area("youtube thumbnail script")[0], "content")
        self.assertEqual(extract.route_area("mmm hmm okay")[0], "admin")
        self.assertLess(extract.route_area("mmm hmm okay")[1], 0.5)


class DashboardTests(Base):
    def test_renders_with_empty_database(self) -> None:
        html = dashboard.render(self.conn)
        self.assertIn("Savvy Hub", html)
        self.assertIn("Nothing waiting", html)

    def test_pending_proposal_shown_with_actions(self) -> None:
        with vault.propose(self.cfg, self.conn, "Needs a look", vault.TIER_HOLD) as p:
            p.write("admin/general/note/n.md", "content")

        html = dashboard.render(self.conn)
        self.assertIn("Needs a look", html)
        self.assertIn('value="approved"', html)

    def test_titles_are_escaped(self) -> None:
        with vault.propose(self.cfg, self.conn, "<script>alert(1)</script>", vault.TIER_HOLD) as p:
            p.write("admin/general/note/n.md", "x")

        html = dashboard.render(self.conn)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertIn("&lt;script&gt;", html)


if __name__ == "__main__":
    unittest.main()
