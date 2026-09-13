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

5. Refresh the copy of the game's save file, but only if it changed since the last update. Compare the game's file against the newest copy already in `player-info/` and skip the copy when they are identical (macOS; the container path can change between builds, so find it rather than hardcoding it):

   ```sh
   mkdir -p player-info \
     && src="$(find ~/Library/Containers -name playerInfo.dat 2>/dev/null | head -1)" \
     && latest="$(ls -t player-info/playerInfo-*.dat 2>/dev/null | head -1)" \
     && if [ -n "$latest" ] && cmp -s "$src" "$latest"; then
          echo "save unchanged since $latest"
        else
          dst="player-info/playerInfo-$(stat -f '%Sm' -t '%Y.%m.%d-%H.%M' "$src").dat"
          cp -p "$src" "$dst" && echo "copied save to $dst"
        fi
   ```

6. Count reports again and tell the user: how many new reports were imported (after − before, plus the importer's own matched/wrote/skipped line), how many total rows the converter wrote, and the stats build's farm/tournament counts, and whether the save file was copied (with its timestamp) or skipped because it matched the newest existing copy.

## Notes

- Files are named after the battle's own timestamp — and save files after the save's own timestamp — so re-running overwrites in place rather than piling up duplicates. The save copy is skipped outright when its bytes match the newest copy already in `player-info/`, so a run with no new save leaves the folder untouched.
- If the importer fails with missing credentials, point the user at `.env` (see `.env.example`) and https://myaccount.google.com/apppasswords.
- `battle-reports/` and `player-info/` are gitignored; there is nothing to commit after an update.
- The player info copy only works on the machine the game runs on. If `find` turns up nothing, say so and carry on — the report import still stands.
