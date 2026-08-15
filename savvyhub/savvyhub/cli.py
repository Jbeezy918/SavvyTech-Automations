"""Command line entry point."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

from . import config, dashboard, db, extract, ingest, vault, watcher


def _open(args: argparse.Namespace) -> tuple[config.Config, sqlite3.Connection]:
    cfg = config.load(args.home)
    conn = db.connect(cfg.db_path)
    db.init(conn)
    return cfg, conn


def cmd_init(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    vault.ensure(cfg)
    results = ingest.scan(cfg, conn)
    print(f"SavvyHub ready at {cfg.home}\n")
    for r in results:
        print(f"  {r.source:<14} {r.mode:<7} {r.status}")
    print("\nNext: `savvyhub extract` then `savvyhub dashboard`")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    for r in ingest.scan(cfg, conn):
        print(f"{r.source:<14} {r.mode:<7} found={r.found:<5} new={r.imported:<5} {r.status}")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    results = extract.extract_pending(cfg, conn, limit=args.limit)
    if not results:
        print("Nothing to extract.")
        return 0
    for r in results:
        tier = "hold" if r["tier"] == config.TIER_HOLD else "auto-merge"
        print(f"conversation {r['conversation_id']}: {r['candidates']} item(s) [{tier}]")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    counts = db.counts(conn)
    print(f"SavvyHub  {cfg.home}\n")
    for key, value in counts.items():
        print(f"  {key:<15} {value}")

    print("\nSources")
    for s in db.source_health(conn):
        flag = "STALE" if s["stale"] else "ok"
        print(f"  {s['name']:<14} {s['mode']:<7} {flag:<6} "
              f"{s['conversations']:>4} convos  last={s['last_import_at'] or 'never'}")

    pending = vault.pending(conn)
    print(f"\nPending proposals ({len(pending)})")
    for p in pending:
        when = "waits for you" if p["tier"] == config.TIER_HOLD else f"auto in {p['hours_left']}h"
        print(f"  #{p['id']:<4} [{when}] {p['title'][:60]}")
    return 0


def cmd_diff(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    row = conn.execute("SELECT branch FROM proposals WHERE id = ?", (args.id,)).fetchone()
    if row is None:
        print(f"no proposal {args.id}", file=sys.stderr)
        return 1
    print(vault.diff(cfg, row["branch"]) or "(no changes)")
    return 0


def cmd_decide(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    verdict = "approved" if args.command == "approve" else "rejected"
    try:
        result = vault.decide(cfg, conn, args.id, verdict, note=args.note or "")
    except vault.VaultError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if not result.get("ok"):
        print(f"proposal {args.id}: {result.get('error')}", file=sys.stderr)
        return 1
    print(f"proposal {args.id} {verdict}")
    return 0


def cmd_tick(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    merged = vault.tick(cfg, conn)
    print(f"{len(merged)} proposal(s) auto-merged")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    vault.ensure(cfg)
    print(f"watching {cfg.home} (ctrl-c to stop)")
    watcher.run(cfg, conn, once=args.once, poll=args.poll)
    return 0


def cmd_dashboard(args: argparse.Namespace) -> int:
    cfg, conn = _open(args)
    dashboard.serve(cfg, conn, port=args.port)
    return 0


def cmd_install(args: argparse.Namespace) -> int:
    cfg, _ = _open(args)
    plist = watcher.launchd_plist(cfg, sys.executable)
    target = Path("~/Library/LaunchAgents/com.savvytech.savvyhub.plist").expanduser()
    if args.write:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(plist)
        print(f"wrote {target}\n\nload it with:\n  launchctl load -w {target}")
    else:
        print(plist)
        print(f"# re-run with --write to install to {target}", file=sys.stderr)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="savvyhub", description="Savvy Hub")
    parser.add_argument("--home", help="override SAVVYHUB_HOME")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create the vault and do a first scan")
    sub.add_parser("scan", help="import new conversations from every source")
    sub.add_parser("status", help="show counts, source freshness and pending work")
    sub.add_parser("tick", help="land any tier-2 proposals past their deadline")

    p = sub.add_parser("extract", help="turn imported conversations into proposals")
    p.add_argument("--limit", type=int, default=25)

    p = sub.add_parser("diff", help="show what a proposal would change")
    p.add_argument("id", type=int)

    for name, helptext in (("approve", "merge a proposal"), ("reject", "drop a proposal")):
        p = sub.add_parser(name, help=helptext)
        p.add_argument("id", type=int)
        p.add_argument("--note", help="why (recorded as a learning signal)")

    p = sub.add_parser("watch", help="run the daemon loop")
    p.add_argument("--once", action="store_true", help="single pass then exit")
    p.add_argument("--poll", type=int, default=5)

    p = sub.add_parser("dashboard", help="serve the one screen on localhost")
    p.add_argument("--port", type=int, default=7373)

    p = sub.add_parser("install-daemon", help="print or write the launchd job")
    p.add_argument("--write", action="store_true")

    return parser


HANDLERS = {
    "init": cmd_init,
    "scan": cmd_scan,
    "extract": cmd_extract,
    "status": cmd_status,
    "diff": cmd_diff,
    "approve": cmd_decide,
    "reject": cmd_decide,
    "tick": cmd_tick,
    "watch": cmd_watch,
    "dashboard": cmd_dashboard,
    "install-daemon": cmd_install,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return HANDLERS[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
