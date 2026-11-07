# Google Sheets integration — agreed implementation requirements

Status: application screens, historical mirror, approval preview, durable update jobs,
safe retry, and replenishment rollover are implemented. The authenticated Apps
Script connection is configured. Google writes remain disabled for manual setup.

## Destinations and ownership

Five workbooks: MAD PCF Operations, MAD PCF Buying, MAD PCF Selling, MAD PCF LMR,
and Dryve PCF. Selling is the third workbook originally supplied, not a second
Buying fund. The approving custodian determines the destination. Routing must
also validate the voucher fund; never silently select a different custodian's
workbook when the approving account has no mapping or several possible matches.
Accounting/admin maintains explicit fund/custodian/workbook mappings.

A replenishment refills an existing fund. Each received replenishment opens a new
worksheet in its workbook, continuing the existing numbering and approved
workbook-specific template. Multiple custodians must not independently create
duplicate cycles. Retain the previous worksheet and its references.

## Encoding

Preserve each workbook's actual column order, styling, date/number formats,
validation, account summaries, sign-off areas, and intentional formulas.
One actual expense line maps to one spreadsheet expense row. Record the actual
expense date, not submission or approval date. Keep filing and approval dates in
the application for auditing and optional filtering.

Do not collect, calculate, or encode Input VAT. Do not clear existing historical
VAT values or remove the column. New automation must not write VAT cells, and
must not treat VAT as a new cash receipt. Existing formulas that refer to VAT
need inspection when selecting a rollover template; preserve history and report
broken formulas rather than silently repairing financial records.

Collect the fields required by the chosen destination: expense date, category,
particulars, amount, employee/point person, supplier, receipt number, vehicle
plate(s), and supplier TIN/address where the template includes them. Supplier
metadata is per expense line, not just per voucher. Missing receipt reasons
remain mandatory when no attachment exists. AI receipt scanning remains removed.
No extra Accounting approval stage is required before the custodian's sheet sync.

## Approval and delivery

1. Fetch the current submitted liquidation and explicit destination mapping.
2. Prepare a preview containing workbook, worksheet, expense rows, amounts,
   warnings, and exactly what will be written. Show Input VAT as untouched.
3. Bind confirmation to liquidation revision, reviewer, mapping version, and
   target worksheet. Reject stale previews and require another confirmation.
4. Approve liquidation and enqueue a durable sync job in the same DB transaction.
5. Write new rows and stable identifiers atomically through Sheets batchUpdate.
6. Show a persistent result report with destination link, inserted row count,
   total, completion timestamp, and pending/conflict/error details.

Approval is independent of Google availability. A failed delivery is visibly
"Approved — sheet update pending"; safe retry never repeats approval or changes
cash. A timeout after a successful Google write must be reconciled by stable
operation/line identifiers before retrying. Keep a durable attempt history.
Serialize writes and replenishment rollover per workbook. Do not overwrite a
staff-edited row on retry. Locks prevent competing automation jobs but do not
lock human spreadsheet editors; detect conflicts separately.

## Historical data and staff edits

Historical worksheet transactions appear in the Accounting dashboard. Explicitly
classify special/scratch tabs before import. Operations contains multiple
numbering sequences and generic Sheet tabs; Dryve includes a ROSEMARIE list.
Never double count a copied template, a summary row, or a duplicate historical
entry as new spend. Preserve source workbook, tab ID, row identity and snapshot
time. Manual sheet edits update the mirrored dashboard view, not approved
application records or fund cash balances. Surface differences for review.

Use paginated cached database reads for dashboard filters. Refresh source data
in the background with a shared per-workbook refresh lease, minimum interval,
timeout/backoff, and visibility-aware client polling. Show last successful sync,
current refresh state, stale/error indicators, and Refresh now. A failed import
must retain the last complete snapshot. Open in Google Sheets uses a direct
workbook/worksheet link and normal Google access controls.

## Accounting dashboard

Default to recent activity; support month, custom date range, and all history.
Filter by workbook/fund, company, worksheet/replenishment cycle, custodian,
requester/point person, category, source, approval/settlement/receipt/sync state.
Search voucher number, particulars, employee, supplier, receipt number, and plate.
Show filtered expense totals, fund balances, outstanding advances, approved
liquidations, returns/reimbursements, replenishments, and sync exceptions with
clear distinctions between app cash balances and spreadsheet-derived totals.
Support detail navigation, printable results, and CSV export of the filtered set.
Restrict aggregate financial data to Accounting/Admin, with custodian-scoped
sync reports as appropriate; enforce authorization server-side and in RLS.

## Access and configuration still needed

- Custodian account for each workbook, and corresponding application fund.
- Authenticated Google edit access: the current successful exports are read-only.
  The existing Drive photo Apps Script is not a Sheets editing connection.
- Verified active worksheet and template per workbook. Do not infer active tabs
  solely from position or highest number, particularly in Operations.

Private original exports and workbook findings are kept in the git-ignored
`.secrets/sheet-study/` directory. No source worksheet has been modified.

## API references

- https://developers.google.com/workspace/sheets/api/guides/batchupdate
- https://developers.google.com/apps-script/reference/lock/lock-service


## Manual testing setup

- Admin: open `/admin/funds` to create the test funds with the desired starting
  amounts and limits. No fictitious fund balances are seeded by this integration.
- Assign custodians to funds at `/funds`, then open `/admin/sheets` to select the
  fund and active worksheet and enable each destination. Test custodians 1–5 are
  preassigned to Operations, Buying, Selling, LMR, and Dryve respectively.
- Operations remains without an active tab because `Sheet19` has newer entries
  than `PCF LEO REPLENISHMENT #5`; Admin chooses which is authoritative.
- Open `/accounting` to search the imported history, filter dates, export the
  displayed page, print, refresh the mirror, and open the source worksheets.
- When ready to perform your own write test, change `PCF_WRITES_ENABLED` to `true`
  in Apps Script Project Settings > Script properties. This property change
  does not require a code deployment. Writes are only sent after app approval
  confirmation or receipt confirmation for a replenishment.
- Create requests/vouchers with your own test data. During liquidation supply
  an actual expense date per line plus supplier/receipt/plate details where
  applicable. The custodian sees each outgoing expense in the sheet preview.
- If Google is unavailable or writes are disabled, approval remains recorded
  and the detail page shows a pending update with review/retry. Retry checks
  Google's permanent receipt first. A stale or changed worksheet requires a
  new preview. No duplicate approval or cash movement occurs on a sheet retry.
- Accounting receipt confirmation queues a new numbered worksheet. Pending
  creation and retry appear on `/accounting`. It waits for prior liquidation
  updates. Templates containing broken formula references are rejected with a
  visible message rather than copying the error into a new cycle.
- Generic scratch/detail tabs are excluded from history; Operations `Sheet19`
  is included as a recognizable ledger with explicit source provenance.
  Overlapping historical tabs are not silently consolidated into fund balances.
- CSV exports are explicitly scoped to the displayed filtered page. Financial
  balances and settlement status remain in the existing app dashboard.

No end-to-end workflow was executed and no Google Sheets writes were performed
while building this release. Checks use source fixtures and rollback-only schema
validation. Offsite backups, email delivery, and AI scanning are unchanged.

Use exact worksheet account tags for categories. A per-line Google Sheets tag override is available when app category names differ. Preview rejects tags that would be omitted by the destination SUMIF summaries. A company override supports mixed-company rows in the Dryve workbook.
