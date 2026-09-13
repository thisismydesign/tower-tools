---
name: update
description: Import new battle reports from Gmail, refresh the player info save file, and rebuild the combined CSV. Use when the user wants to update, refresh, or sync battle reports.
---

# Update battle reports

Import new battle reports from Gmail drafts, refresh the copy of the game's save file, then convert the full set into the combined CSV.

## Steps

1. Count existing reports so you can report what's new:

   ```sh
   ls battle-reports/*.txt 2>/dev/null | wc -l
   ```

2. Import from Gmail (needs `EMAIL_ADDRESS` and `IMAP_PASSWORD` in `.env`):

   ```sh
   pnpm import:battle-reports
   ```

3. Convert all reports into the combined CSV:

   ```sh
   pnpm convert:battle-reports -- \
     --timezone Europe/Budapest \
     --input battle-reports \
     --output battle-reports/00-combined.csv \
     --tournament-detection-max-waves 3000
   ```

4. Rebuild the stats JSON for the Battle Report Stats canvas:

   ```sh
   pnpm stats:battle-reports
   ```

5. Copy the game's save file, named after the save's own timestamp (macOS; the container path can change between builds, so find it rather than hardcoding it):

   ```sh
   mkdir -p player-info && src="$(find ~/Library/Containers -name playerInfo.dat 2>/dev/null | head -1)" && cp -p "$src" "player-info/playerInfo-$(stat -f '%Sm' -t '%Y.%m.%d-%H.%M' "$src").dat"
   ```

6. Count reports again and tell the user: how many new reports were imported (after − before, plus the importer's own matched/wrote/skipped line), how many total rows the converter wrote, and the stats build's farm/tournament counts, and the timestamp of the save file just copied.

## Notes

- Files are named after the battle's own timestamp — and save files after the save's own timestamp — so re-running overwrites in place rather than piling up duplicates.
- If the importer fails with missing credentials, point the user at `.env` (see `.env.example`) and https://myaccount.google.com/apppasswords.
- `battle-reports/` and `player-info/` are gitignored; there is nothing to commit after an update.
- The player info copy only works on the machine the game runs on. If `find` turns up nothing, say so and carry on — the report import still stands.
