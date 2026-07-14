# Uninstallation

SOPsync stores everything in two places: the app bundle and one data folder.

## 1. Quit the app
Quit from the menu-bar tray → **Quit SOPsync** (this cleanly stops any active
capture and closes the database).

## 2. Remove the application
```bash
rm -rf /Applications/SOPsync.app
```

## 3. Remove application data (evidence, database, backups, logs)
> ⚠️ This permanently deletes all captured evidence and audit history. Export or
> back up anything you need first (see `docs/BACKUP_RECOVERY.md`).
```bash
rm -rf ~/Library/Application\ Support/SOPsync
```

## 4. Remove Keychain secrets
The database key and any AI-provider keys are stored under the Keychain service
`com.savvytech.sopsync`:
```bash
security delete-generic-password -s com.savvytech.sopsync 2>/dev/null || true
```
Or open **Keychain Access**, search for `com.savvytech.sopsync`, and delete the
entries.

## 5. Revoke macOS permissions (optional)
System Settings → Privacy & Security → remove SOPsync from **Screen Recording**,
**Accessibility**, and **Microphone**.

After these steps no SOPsync data or credentials remain on the machine.
