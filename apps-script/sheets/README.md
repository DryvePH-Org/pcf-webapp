# PCF Sheets Apps Script connection

This is the Google-side bridge, not the finished PCF dashboard or transaction
mapping implementation. Deploying it lets the backend connect later. It performs
no writes on setup, no scheduled polling, no invitations, and no emails.

1. Create a new standalone project at https://script.google.com/ using an account
   with Editor access to all five PCF workbooks. Name it PCF Sheets Automation.
2. Replace Code.gs with this directory's Code.gs. Do not replace the existing
   voucher-photo Apps Script project.
3. Project Settings: enable Show appsscript.json manifest file in editor.
   Replace that file with this directory's appsscript.json. It enables the
   advanced Sheets v4 service, spreadsheet scope, and Manila timezone.
   If using a custom Cloud project, enable Google Sheets API there as well.
4. Save. Select setupPCF in the function dropdown and Run. Authorize the account.
   Logs should show read access verified for all five workbook keys. This does
   not verify Editor permission by writing a test cell. Confirm Editor access
   using Google sharing settings. Do not create artificial transactions.
5. In Project Settings > Script properties, PCF_SHARED_SECRET is generated
   automatically. PCF_WRITES_ENABLED starts as false. Keep it false until the
   application integration and destination mappings are installed and checked.
6. Deploy > New deployment > Web app. Execute as Me. Who has access: Anyone.
   If Workspace policy does not offer Anyone, do not change the sharing of the
   source workbooks; ask the administrator about a permitted deployment method.
   Every data request checks the secret. GET returns only a service identifier.
7. Copy the /exec URL and provide it for server configuration.
8. Keep the shared secret private. On this Mac, copy its value, then run from
   the repository root:

   ```sh
   (umask 077; pbpaste > .secrets/pcf-sheets-secret.txt)
   ```

   The server will use GOOGLE_SHEETS_SCRIPT_URL and GOOGLE_SHEETS_SCRIPT_SECRET.
   Never put the secret in a NEXT_PUBLIC variable, Git, or client JavaScript.

After code changes, use Deploy > Manage deployments > Edit > New version.

## Contract

POST JSON includes secret and action. Book keys are operations, buying, selling,
lmr, dryve. Custodian assignments are enforced by the PCF backend, not hardcoded
email addresses in this script. Each workbook is allowlisted by ID.

- catalog: actual Google tab IDs, names, order, grid sizes and workbook links.
- read: book, sheetId, startRow (zero-based), limit (1–500); A:AZ values, formulas,
  formatting and pagination, for historical ingestion and subsequent refresh.
- preview: book, operationId (16–80 alphanumeric/underscore/hyphen), requests
  (validated Sheets batch requests). Returns a five-minute token bound to the
  affected worksheets' used cells and the workbook catalog, formatting, request hash and job.
- commit: same book/operationId/requests plus token; requires writes enabled.
  Writes and permanent operation receipts use the same Sheets atomic batch.
- status: book, operationId; reconcile uncertain network outcomes before retries.

Requests may add a blank sheet, insert rows, update explicit user-entered cells,
copy formatting/validation, and configure merges/widths on newly added sheets.
Delete requests and copying old transaction values are rejected. The backend
must construct the reviewed template-specific formulas, summaries, numbering,
row ranges and accounting report. Input VAT columns detected in header rows are
blocked for existing-sheet value writes. Do not generate VAT data in new-sheet
plans. No receipt file contents or Google credentials belong in requests.

If the sheet changes after preview, obtain a new preview and confirmation. If the
operation already succeeded, identical retries return its receipt without writing
again. Different payloads using that operation ID are rejected. Google API errors
are returned generically; retain app-side job/attempt history for diagnosis.

Limitations: ScriptLock serializes automation, not human editors. A human edit
can still occur between the final comparison and Google's batch execution;
app-side reconciliation must flag differences rather than overwrite them. A
affected-worksheet comparison is deliberately conservative; the background dashboard
should use bounded reads and cached snapshots, not preview calls. Metadata uses
Google quotas; monitor usage and retain app-side operation history. Do not remove
PCF operation metadata without a coordinated archival/idempotency strategy.

The seven local bridge tests use mocks and do not modify any workbook:
`node --test apps-script/sheets/bridge.test.mjs`.


## Version 2 — oversized-preview fix

Version 1 could return Google error 413 while reading all workbook grid data.
Version 2 reads a small workbook catalog, then only affected worksheets' used
cells in chunks of at most 100 rows by 26 columns. Snapshot bounds and the
catalog remain part of stale-preview detection. Unrelated historical grids are
not downloaded for a transaction preview. Input VAT protections use absolute
row positions so later chunks cannot be mistaken for column headers.

To install, replace Code.gs in the existing project, save, then Deploy > Manage
deployments > Edit (pencil) > Version: New version > Deploy. Keep the existing
/exec deployment URL and script properties. Opening the URL must show version 2.
No manifest change, secret rotation, or source-sheet edit is needed.


## Version 3 — stable preview identity

Object-key order can change in Google API responses and Postgres jsonb storage.
Version 3 sorts object keys before hashing requests and worksheet snapshots;
array order, values, formatting, and worksheet metadata still participate in the
comparison. Real edits still invalidate the preview. Do not remove operation
metadata or disable edit detection. Install by replacing Code.gs and selecting
New version on the existing deployment; its GET response should show version 3.
