# Backup & Recovery

## Automatic protections
- **Transaction-safe writes.** Every capture event (and its screenshot) is
  committed in a single database transaction. A crash mid-write rolls back — you
  never get a half-written event or a screenshot row without its file.
- **Immutable originals.** Screenshot originals are written once and hashed; they
  are never overwritten, so recovery never loses evidence.
- **Crash recovery.** On the next launch, any session left `running`/`paused` is
  marked **recovered** with all evidence intact. Open it from the dashboard to
  resume or finalize. (`AppContext.recoverInterruptedSessions`)
- **Watchdog.** Unhealthy internal services are restarted without interrupting an
  active capture.

## Manual backup
System Health → **Back up database now**, or programmatically `AppContext.backup()`.
Backups are written to `~/Library/Application Support/SOPsync/backups/
sopsync-<timestamp>.db` using SQLite's online backup API (safe during use).

For a **full** backup, also copy the `evidence/` and `derived/` folders — the
database references those files by path and hash.

## Configurable backup location
Copy or symlink the `backups/` directory to an external/secure volume, or schedule
a periodic `cp` of the whole `SOPsync/` data folder. (A built-in scheduler is a
follow-up; the backup command and paths are stable.)

## Restore
1. Quit SOPsync.
2. Replace `~/Library/Application Support/SOPsync/sopsync.db` with the chosen
   backup file.
3. Restore the matching `evidence/` and `derived/` folders alongside it.
4. Relaunch. The database key in the Keychain must be the same one used when the
   backup was made (it is generated once per machine and persists).

## Export as an alternative
For off-machine transfer, use **Export** to produce a JSON/HTML/CSV report or an
evidence package rather than copying the raw encrypted database. Exports record a
SHA-256 for verification.

## Verifying evidence integrity
Each screenshot row stores `original_sha256`. Re-hash the file on disk and compare
to confirm an original has not been altered. The System Health screen runs a
database `integrity_check` and reports the result.
