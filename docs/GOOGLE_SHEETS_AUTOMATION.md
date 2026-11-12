# Google Sheets automation

The webapp uses one Grokbot per spreadsheet for Google Sheets operations, each with its own webhook URL and secret (server-only settings):

| Sheet | Webhook URL | Secret | Routine |
| --- | --- | --- | --- |
| MAD Buying | `GROKBOT_WEBHOOK_URL` | `GROKBOT_WEBHOOK_SECRET` | [GROKBOT_BUYING_ROUTINE.md](GROKBOT_BUYING_ROUTINE.md) |
| DRYVE PCF | `GROKBOT_DRYVE_WEBHOOK_URL` | `GROKBOT_DRYVE_WEBHOOK_SECRET` | [GROKBOT_DRYVE_ROUTINE.md](GROKBOT_DRYVE_ROUTINE.md) |

The allowed sheets are listed in `src/lib/grokbot/targets.ts` and, for the database, in the `grokbot_targets()` SQL function. Adding a sheet means adding it in both places, giving it its own bot and routine, and opening it in `src/lib/sheets/open-books.ts`.

DRYVE PCF: spreadsheet `1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ`, tab `DRYVE PCF - NOV TO DEC 2026` (gid `1251133408`). The sheet has a COMPANY column that the custodian fills per expense line in receipt review, and an EXPENSE TYPE dropdown taken from its summary of accounts. TIN and receipt number are kept in the app and not written to this sheet. Replenishments are inline marker rows (`REPLENISHMENT #14`, and so on) in the same tab.

The current rollout edits MAD Buying, spreadsheet `1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk`, ledger tab ID `1042918180`. Use the verified Google connection `admin.manilaautodisplay@gmail.com`. The audit tab ID is `2133354940`.

Custodian approval displays a bound preview of the reviewed expense lines. Confirmation records approval and a durable pending delivery. Grokbot receives the saved values, writes the expenses, verifies the result and returns an authenticated callback. A verified completion updates the saved sheet delivery report.

Accounting and independent Approver approval queue a green replenishment marker in the same continuous ledger. The sequence starts at #01. Cash handover uses the same replenishment identity.

Operations are dispatched serially. Each run claims a runner UUID before editing. Retries retain the operation identity and reconcile prior results. An uncertain webhook acknowledgement remains active for investigation. Read-only refreshes return a complete bounded snapshot to update the Buying dashboard mirror. Existing historical workbook data remains stored.

Admin Google Sheets settings include a controlled simulation with labeled temporary expense and replenishment entries. It requires the original empty ledger and ₱40,000 beginning balance, verifies encoding, restores its ledger cells and retains audit history.

Paste the full instructions in [GROKBOT_BUYING_ROUTINE.md](GROKBOT_BUYING_ROUTINE.md) into the bot's saved routine after changing the protocol. Review blocked, failed and uncertain jobs before retrying them.
