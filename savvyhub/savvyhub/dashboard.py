"""The one screen.

Reads live from SQLite, so it shows the current state rather than the state as
of the last batch run. Binds to localhost only - this is your business in here.
"""

from __future__ import annotations

import html
import json
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from . import db, vault
from .config import TIER_HOLD, Config

STYLE = """
:root {
  --bg: #fbfaf9; --panel: #fff; --ink: #1c1917; --muted: #78716c;
  --line: #e7e5e4; --accent: #b45309; --ok: #15803d; --warn: #b45309; --bad: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#1c1917; --panel:#292524; --ink:#f5f5f4; --muted:#a8a29e;
          --line:#44403c; --accent:#fbbf24; --ok:#4ade80; --warn:#fbbf24; --bad:#f87171; }
}
* { box-sizing: border-box; }
body { margin:0; padding:2rem 1.25rem 4rem; background:var(--bg); color:var(--ink);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.wrap { max-width: 62rem; margin: 0 auto; }
h1 { font-size:1.4rem; margin:0 0 .25rem; letter-spacing:-.01em; }
.sub { color:var(--muted); font-size:.85rem; margin-bottom:1.75rem; }
h2 { font-size:.72rem; text-transform:uppercase; letter-spacing:.09em;
  color:var(--muted); margin:2rem 0 .6rem; font-weight:600; }
.stats { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.5rem; }
.stat { background:var(--panel); border:1px solid var(--line); border-radius:9px;
  padding:.6rem .9rem; min-width:6.5rem; }
.stat b { display:block; font-size:1.35rem; font-weight:650; }
.stat span { color:var(--muted); font-size:.72rem; text-transform:uppercase;
  letter-spacing:.05em; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:9px;
  padding:.85rem 1rem; margin-bottom:.5rem; }
.card.hold { border-left:3px solid var(--warn); }
.card.auto { border-left:3px solid var(--ok); }
.card h3 { margin:0 0 .3rem; font-size:.95rem; font-weight:600; }
.meta { color:var(--muted); font-size:.78rem; }
.rationale { white-space:pre-wrap; color:var(--muted); font-size:.8rem;
  margin:.5rem 0 0; padding-left:.75rem; border-left:2px solid var(--line); }
.actions { margin-top:.7rem; display:flex; gap:.4rem; }
button { font:inherit; font-size:.82rem; padding:.35rem .85rem; border-radius:6px;
  border:1px solid var(--line); background:transparent; color:var(--ink); cursor:pointer; }
button.yes { border-color:var(--ok); color:var(--ok); }
button.no { border-color:var(--bad); color:var(--bad); }
button:hover { background:var(--line); }
table { width:100%; border-collapse:collapse; font-size:.85rem; }
td { padding:.4rem .5rem; border-bottom:1px solid var(--line); }
td:first-child { font-weight:550; }
.tag { font-size:.7rem; padding:.1rem .45rem; border-radius:4px;
  border:1px solid var(--line); color:var(--muted); }
.stale { color:var(--warn); } .fresh { color:var(--ok); }
.empty { color:var(--muted); font-size:.85rem; font-style:italic; }
.overflow { overflow-x:auto; }
"""


def _esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def _pending_section(pending: list[dict]) -> str:
    hold = [p for p in pending if p["tier"] == TIER_HOLD]
    auto = [p for p in pending if p["tier"] != TIER_HOLD]
    out = []

    out.append("<h2>Needs you</h2>")
    if not hold:
        out.append('<p class="empty">Nothing waiting.</p>')
    for p in hold:
        out.append(_card(p, "hold", "waits until you decide"))

    out.append("<h2>Auto-merging</h2>")
    if not auto:
        out.append('<p class="empty">Nothing in flight.</p>')
    for p in auto:
        hours = p.get("hours_left")
        when = f"lands in {hours}h unless you stop it" if hours and hours > 0 else "landing now"
        out.append(_card(p, "auto", when))

    return "\n".join(out)


def _card(p: dict, cls: str, when: str) -> str:
    return f"""
<div class="card {cls}">
  <h3>{_esc(p['title'])}</h3>
  <div class="meta">{p['file_count']} file(s) &middot; {_esc(when)} &middot;
    <span class="tag">{_esc(p['branch'])}</span></div>
  <div class="rationale">{_esc(p.get('rationale') or '')}</div>
  <form class="actions" method="post" action="/decide">
    <input type="hidden" name="id" value="{p['id']}">
    <button class="yes" name="verdict" value="approved">Approve</button>
    <button class="no" name="verdict" value="rejected">Reject</button>
  </form>
</div>"""


def render(conn: sqlite3.Connection) -> str:
    stats = db.counts(conn)
    pending = vault.pending(conn)
    sources = db.source_health(conn)

    work = conn.execute(
        """
        SELECT area, project, kind, COUNT(*) AS n
          FROM items WHERE status = 'current'
         GROUP BY area, project, kind ORDER BY n DESC LIMIT 20
        """
    ).fetchall()

    recent = conn.execute(
        """
        SELECT c.title, c.model, s.name AS source, c.imported_at
          FROM conversations c JOIN sources s ON s.id = c.source_id
         ORDER BY c.imported_at DESC LIMIT 10
        """
    ).fetchall()

    upgrades = conn.execute(
        """
        SELECT title, area, confidence FROM items
         WHERE kind IN ('upgrade', 'opportunity', 'idea') AND status = 'current'
         ORDER BY confidence DESC, updated_at DESC LIMIT 10
        """
    ).fetchall()

    stat_html = "".join(
        f'<div class="stat"><b>{v}</b><span>{k}</span></div>' for k, v in stats.items()
    )

    src_rows = "".join(
        f"<tr><td>{_esc(s['name'])}</td>"
        f"<td><span class='tag'>{_esc(s['mode'])}</span></td>"
        f"<td>{s['conversations']}</td>"
        f"<td class='{'stale' if s['stale'] else 'fresh'}'>"
        f"{_esc(s['last_import_at'] or 'never')}</td>"
        f"<td class='meta'>{_esc(s['last_status'] or '')}</td></tr>"
        for s in sources
    ) or "<tr><td colspan='5' class='empty'>No sources registered yet.</td></tr>"

    work_rows = "".join(
        f"<tr><td>{_esc(r['area'])}</td><td>{_esc(r['project'] or 'general')}</td>"
        f"<td>{_esc(r['kind'])}</td><td>{r['n']}</td></tr>"
        for r in work
    ) or "<tr><td colspan='4' class='empty'>Nothing approved into the vault yet.</td></tr>"

    recent_rows = "".join(
        f"<tr><td>{_esc((r['title'] or '')[:80])}</td>"
        f"<td class='meta'>{_esc(r['source'])}</td>"
        f"<td class='meta'>{_esc(r['imported_at'])}</td></tr>"
        for r in recent
    ) or "<tr><td colspan='3' class='empty'>Nothing imported yet.</td></tr>"

    upgrade_rows = "".join(
        f"<tr><td>{_esc(r['title'])}</td><td class='meta'>{_esc(r['area'])}</td>"
        f"<td class='meta'>{r['confidence'] or ''}</td></tr>"
        for r in upgrades
    ) or "<tr><td colspan='3' class='empty'>Nothing surfaced yet.</td></tr>"

    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>Savvy Hub</title><style>{STYLE}</style></head>
<body><div class="wrap">
<h1>Savvy Hub</h1>
<div class="sub">One screen. Live from the catalog, refreshing every 30s.</div>
<div class="stats">{stat_html}</div>
{_pending_section(pending)}
<h2>In flight</h2><div class="overflow"><table>{work_rows}</table></div>
<h2>Upgrades &amp; opportunities found</h2><div class="overflow"><table>{upgrade_rows}</table></div>
<h2>New since last look</h2><div class="overflow"><table>{recent_rows}</table></div>
<h2>Sources</h2><div class="overflow"><table>{src_rows}</table></div>
</div></body></html>"""


def make_handler(cfg: Config, conn: sqlite3.Connection) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args: Any) -> None:
            pass  # quiet by default; the audit trail lives in the events table

        def _send(self, code: int, body: bytes, ctype: str = "text/html; charset=utf-8") -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path.startswith("/api/state"):
                payload = {
                    "counts": db.counts(conn),
                    "pending": vault.pending(conn),
                    "sources": db.source_health(conn),
                }
                self._send(200, json.dumps(payload, default=str).encode(), "application/json")
            elif self.path in ("/", "/index.html"):
                self._send(200, render(conn).encode())
            else:
                self._send(404, b"not found", "text/plain")

        def do_POST(self) -> None:
            if not self.path.startswith("/decide"):
                self._send(404, b"not found", "text/plain")
                return

            length = int(self.headers.get("Content-Length") or 0)
            form = urllib.parse.parse_qs(self.rfile.read(length).decode())
            try:
                proposal_id = int(form.get("id", ["0"])[0])
                verdict = form.get("verdict", [""])[0]
                if verdict not in ("approved", "rejected"):
                    raise ValueError("bad verdict")
                vault.decide(cfg, conn, proposal_id, verdict, by="dashboard")
            except (ValueError, vault.VaultError) as exc:
                self._send(400, str(exc).encode(), "text/plain")
                return

            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()

    return Handler


def serve(cfg: Config, conn: sqlite3.Connection, port: int = 7373) -> None:
    server = HTTPServer(("127.0.0.1", port), make_handler(cfg, conn))
    print(f"Savvy Hub -> http://127.0.0.1:{port}  (ctrl-c to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
