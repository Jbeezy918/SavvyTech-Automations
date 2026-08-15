# Savvy Hub

A local-first knowledge vault. It gathers conversations from every LLM tool that
leaves a trace on your machine, turns them into filed knowledge, and never edits
your current truth without either your approval or a deadline you let pass.

Runs entirely on your Mac. Python 3.11+ and git, both already installed. No
packages to install, no API keys, no service to sign up for.

```bash
export SAVVYHUB_HOME=~/SavvyHub

python3 -m savvyhub init         # create the vault, first scan
python3 -m savvyhub extract      # turn conversations into proposals
python3 -m savvyhub dashboard    # http://127.0.0.1:7373
```

## The one rule

**The agent never edits current truth in place.**

The vault is a git repo. `main` is your truth. Every change the system wants to
make is built on a `proposal/*` branch in its own worktree, so `vault/` stays
exactly as you left it and stays browsable the whole time. Approving is a merge.
Rejecting deletes a branch. The original never moves, so there is nothing to
undo and nothing to lose.

That is what lets it work without you: it is never touching the thing it could
break, so it never has to stop and wait.

## Autonomy tiers

| Tier | What | Behaviour |
|------|------|-----------|
| 1 silent | import, index, hash, dedupe detection | just happens, logged |
| 2 notify | new note in an existing area, new action item | branch, **auto-merges after 24h unless you object** |
| 3 hold | overwrite truth, mark obsolete, merge duplicates, new business area | waits for you, indefinitely |

Tier 2 is what makes it hands-off — silence counts as yes for low-risk changes,
so nothing rots waiting on a busy week. Tier 3 is what makes it safe — silence
never counts as consent for anything destructive. A proposal is judged by its
weakest part: one low-confidence item holds the whole batch for review.

## Layout

Content and state are separate axes, which is why they are not both folders.

```
SavvyHub/
├── vault/      git repo. main = truth. Only place you browse by hand.
├── inbox/      drop zone. Drains automatically.
├── archive/    original imports, content-hash named, never edited.
├── db/         savvy.db — status, area, links, proposals, decisions.
├── logs/       daemon output.
└── system/     sources.json path overrides.
```

An item is *GovCon* **and** *proposed* **and** *linked to two projects*, all at
once. Folders can only express one axis, so lifecycle lives in SQLite columns
and topic lives in the tree. Markdown holds the writing, so the vault stays
readable with no tooling at all.

## Sources, and honest coverage

Every connector declares its mode. The dashboard shows last import per source,
because a source of truth that hides its own gaps is worse than one that admits
them.

| Mode | Sources | Reality |
|------|---------|---------|
| `live` | Claude Code, Codex | JSONL on disk. Fully automatic, seconds behind. |
| `export` | Claude.ai, ChatGPT, Gemini | No API exists for reading your own chat history. You download the export; import is automatic from there. |
| `manual` | phone, tablet | Share-sheet into `inbox/`. |

Cloud chat products expose no endpoint for conversation history. The only way to
make those "live" would be replaying session cookies against private endpoints —
fragile, against terms, and it means a background daemon holding credentials to
your accounts. Not built, deliberately. Drop the export in `inbox/` instead;
everything downstream is identical.

Reading a ChatGPT export off local disk sends nothing to OpenAI. No account is
linked and no request leaves the machine — it is a file on your Mac. Nothing in
this system calls a hosted model.

Transcript paths move between tool releases. Override them in
`system/sources.json`:

```json
{ "claude-code": "/Users/joe/.claude/projects" }
```

## Running it for real

Two clocks, deliberately. A filesystem poll keeps the index seconds behind
reality; extraction and the auto-merge sweep run on a slower cycle. Both on one
twice-daily timer is what would make the dashboard feel dead.

```bash
python3 -m savvyhub watch                    # foreground
python3 -m savvyhub install-daemon --write   # launchd job, survives reboot
launchctl load -w ~/Library/LaunchAgents/com.savvytech.savvyhub.plist
```

## Commands

| Command | Does |
|---------|------|
| `init` | create the vault, first scan |
| `scan` | import new conversations from every source |
| `extract` | turn imported conversations into proposals |
| `status` | counts, source freshness, pending work |
| `diff <id>` | exactly what a proposal would change |
| `approve <id>` / `reject <id>` | decide, with an optional `--note` |
| `tick` | land tier-2 proposals past their deadline |
| `watch` | the daemon loop |
| `dashboard` | the one screen, on localhost |

## Learning

Every approve and reject is written to `decisions` with its tier, area and
confidence. That table is the training signal: routing rules and confidence
thresholds tune themselves out of real behaviour, so the system needs you less
over time.

It does not rewrite its own source code unattended. A system that silently edits
the code governing your source of truth is one bad generation away from
corrupting everything quietly, and you would find out months later. Code changes
go through a pull request — the same copy-on-write rule, applied to itself.

## What is not built yet

- **Ollama extraction.** `extract.py` ships a keyword/pattern extractor that
  works today with no model. The local-model extractor drops in behind the same
  `Extractor` interface; everything downstream is unchanged. Routing is crude
  until then — it files "update the DNS records" under `admin` rather than
  `software`.
- **Ollama logging proxy.** Ollama is stateless and keeps no history. Direct API
  chats are unrecoverable unless a proxy logs them going forward. Open WebUI and
  LM Studio keep their own stores and can be read directly.
- **Semantic dedupe.** Exact content hashing works now; near-duplicate detection
  needs embeddings.
- **Cursor / VS Code connectors.** SQLite `state.vscdb`, same connector shape.

## Tests

```bash
cd savvyhub && python3 -m unittest discover -s tests
```

24 tests, no dependencies. The ones that matter assert that `main` is untouched
while a proposal is open, that a rejected proposal leaves no trace, that tier 3
never auto-merges no matter how long it sits, and that re-importing the same
export twice imports it once.
