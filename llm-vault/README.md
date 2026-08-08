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

## 2. Drop the files in

Put each file in its folder (any layout works — it auto-detects the provider):

```
llm-vault/exports/chatgpt/conversations.json
llm-vault/exports/claude/conversations.json
llm-vault/exports/gemini/MyActivity.json
```

## 3. Import everything with one command

```bash
cd llm-vault
python3 vault.py ingest exports
```

Re-run it any time you download a fresh export — it updates, it doesn't
duplicate.

---

## Using your vault

```bash
python3 vault.py stats                 # what's in here
python3 vault.py list                  # newest conversations (with tags)
python3 vault.py list --provider claude
python3 vault.py search "pricing"      # find anything you ever discussed
python3 vault.py show 42               # read conversation #42 in full
python3 vault.py tag 42 h-mountain     # file it under an idea/plan
python3 vault.py tag 42 pricing        # tag with as many as you like
python3 vault.py tags                  # all your folders/ideas + counts
python3 vault.py untag 42 pricing
```

Tags are how you "file them however you want" — think of them as folders a
conversation can live in several of at once (`gov-con`, `website`,
`smart-home`, `pricing`, …).

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

- `auto-tag` — have a local LLM read each conversation and suggest idea/plan tags
- `export` — dump a tag's conversations to Markdown for a project brief
- Semi-automated **requesting** of new exports (reminders + pre-filled links)
