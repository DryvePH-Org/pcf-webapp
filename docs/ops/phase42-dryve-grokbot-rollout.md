# Rollout: the DRYVE sheet and its own Grokbot (migration phase 42)

## What changes
- A second Grokbot (one bot per spreadsheet) for `DRYVE PCF - NOV TO DEC 2026`,
  with its own webhook URL, secret and routine. Buying is unchanged.
- The database allows operations only for the two listed sheets, runs a sheet's
  operations one at a time, and lets different sheets run side by side.
- The custodian picks the **Company** (DRYVE or VENTA) per expense line in receipt
  review, and the expense type from the sheet's own list. TIN and receipt number
  stay in the app and are not written to the DRYVE sheet.
- Replenishments for DRYVE add a marker row (`REPLENISHMENT #14`) in the same tab.
- The `dryve` workbook is pointed at the new spreadsheet and stays **disabled**
  until an administrator assigns its custodian and fund.

## Part 1: database and deploy (same steps as phases 39 to 41)
1. `supabase db push --linked --dry-run` should list only
   `20261112220000_phase42_dryve_grokbot_sheet.sql`, then
   `supabase db push --linked`.
2. `supabase migration list --linked` shows 20261112220000 on both sides.
3. `python3 scripts/migration-fingerprint.py`, put the value in
   `/opt/pcf/schema.sha256` over SSH, re-run "CI and deploy" on `main`.

## Part 2: connect the DRYVE bot (server settings)
In `/opt/pcf/.env.runtime` on the server add (values from the DRYVE automation;
never paste them into chat or commit them):
`GROKBOT_DRYVE_WEBHOOK_URL=...` and `GROKBOT_DRYVE_WEBHOOK_SECRET=...`.
Restart the app. The Buying settings stay as they are.

## Part 3: turn it on in the app
1. Admin, Google Sheets settings: open the `dryve` workbook, choose the fund and
   its custodian (Justine Cuyos at the moment), the worksheet `DRYVE PCF - NOV TO
   DEC 2026`, and enable it.
2. Press "Refresh now" to read the sheet (the bot makes zero changes).
3. Do a first liquidation with a small real expense and check the sheet and the
   `GROKBOT EDIT AUDIT` tab.
