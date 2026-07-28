---
name: update
description: Import new battle reports from Gmail and rebuild the combined CSV. Use when the user wants to update, refresh, or sync battle reports.
---

# Update battle reports

Import new battle reports from Gmail drafts, then convert the full set into the combined CSV.

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

5. Count reports again and tell the user: how many new reports were imported (after − before, plus the importer's own matched/wrote/skipped line), how many total rows the converter wrote, and the stats build's farm/tournament counts.

## Notes

- Files are named after the battle's own timestamp, so re-importing the same report overwrites in place — running this repeatedly is safe.
- If the importer fails with missing credentials, point the user at `.env` (see `.env.example`) and https://myaccount.google.com/apppasswords.
- `battle-reports/` is gitignored; there is nothing to commit after an update.
