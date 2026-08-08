# 🗄️ LLM Vault

Your own private, local database of your AI conversations — from **ChatGPT,
Claude, and Gemini** — in one place you fully own. Search it, tag it by
idea/plan, and file it however you want. No accounts, no cloud, no installs.

It's one Python file that uses only the standard library, so it "just runs."
Your data stays on your machine — the database (`vault.db`) and your export
files are git-ignored and never leave your computer.

---

## 1. Get your data (one-time, per provider)

Each LLM lets you download your own data. Request it, then unzip it:

| Provider | Where | File you want |
|----------|-------|---------------|
| **ChatGPT** | Settings → Data controls → **Export data** (emailed to you) | `conversations.json` |
| **Claude** | Settings → **Export data** / privacy portal (emailed to you) | `conversations.json` |
| **Gemini** | [Google Takeout](https://takeout.google.com) → **My Activity → Gemini** | `MyActivity.json` |

## 2. Drop the files in — organized by ACCOUNT

Every conversation carries two permanent provenance markers so you never lose
track of where it came from:

- **provider** — which LLM (auto-detected from the file: ChatGPT / Claude / Gemini)
- **account** — *which of your accounts* it came from (e.g. `joe.budds41@gmail`
  vs `joe@yahoo.com`). This matters because you have the **same LLM under
  several accounts**, and you want to keep (or combine) them on purpose.

The easiest way to stamp the account is the **folder layout** — one folder per
account, directly under `exports/`:

```
llm-vault/exports/
  joe.budds41@gmail/
    chatgpt.json
    claude.json
  joe@yahoo.com/
    claude.json
    MyActivity.json        (Gemini)
```

The folder name becomes the account marker automatically. (Provider is still
detected from the file contents, so you don't have to sort by LLM.)

## 3. Import everything with one command

```bash
cd llm-vault
python3 vault.py ingest exports
```

Or stamp the account explicitly for a single file:

```bash
python3 vault.py ingest ~/Downloads/claude.json --account joe@yahoo.com
```

Re-run any time you download a fresh export — it updates, it doesn't duplicate.
The same LLM under two accounts always stays two separate records.

---

## Using your vault

```bash
python3 vault.py stats                          # counts, broken down by provider × account
python3 vault.py accounts                        # your account markers + counts
python3 vault.py list                            # newest conversations (with account + tags)
python3 vault.py list --provider claude          # only Claude
python3 vault.py list --account joe@yahoo.com     # only your Yahoo account
python3 vault.py search "pricing"                # find anything you ever discussed
python3 vault.py search "pricing" --account joe.budds41@gmail   # same idea, one account
python3 vault.py show 42                          # read conversation #42 in full
python3 vault.py tag 42 h-mountain               # file it under an idea/plan
python3 vault.py tag 42 pricing                  # tag with as many as you like
python3 vault.py tags                            # all your idea/plan tags + counts
python3 vault.py untag 42 pricing
```

**Two ways to slice your data, and they combine:**

- **account / provider** = *where it came from* (permanent, set at import) —
  "show me everything from my Yahoo account," or "just my Gmail Claude."
- **tags** = *what it's about* (you set these anytime) — an idea or plan a
  conversation can live under in several places at once (`gov-con`, `website`,
  `smart-home`, `pricing`, …).

So the same idea spread across your Gmail *and* Yahoo accounts can be pulled
together by tag, or split back apart by account — because either way it's all
yours.

### Auto-tagging with your own local LLM

Don't want to tag hundreds of conversations by hand? Point your **own** local
model at the vault and let it suggest idea/plan tags:

```bash
python3 vault.py autotag --dry-run     # preview suggestions, save nothing
python3 vault.py autotag               # tag conversations that have no auto tags yet
python3 vault.py autotag --all         # (re)tag everything
python3 vault.py autotag --conv 42     # just one conversation
```

- **Powered by you:** it talks to a local [Ollama](https://ollama.com) model
  (default `llama3.1` at `http://localhost:11434`). Override with `--model`
  and `--endpoint`, or `OLLAMA_MODEL` / `OLLAMA_HOST`. Nothing leaves your machine.
- **No setup? Still works.** If no local LLM is reachable, it falls back to a
  built-in keyword tagger so you get *something* with zero install.
- **Your hand-tags are safe.** Auto tags are marked separately — re-running
  `autotag` only ever refreshes its own tags and never touches ones you set
  yourself. Anything it suggests, you can still `untag`.

---

## Notes

- **Privacy:** `vault.db` and everything under `exports/` are git-ignored.
  Nothing here is ever committed or uploaded.
- **Gemini** is coarser than the other two — Google Takeout exports your
  prompts as an activity stream, so each prompt becomes a one-line entry
  (ChatGPT and Claude give full back-and-forth threads).
- **Powered by your own LLMs later:** because it's a plain SQLite file, you can
  point any local model or script at `vault.db` to summarize, cluster, or
  auto-tag your own history — no third party involved.

---

## Roadmap (next steps we can add)

- ✅ `autotag` — a local LLM suggests idea/plan tags (done)
- `export` — dump a tag's conversations to Markdown for a project brief
- Semi-automated **requesting** of new exports (reminders + pre-filled links)
