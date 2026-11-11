# Google Sheets automation

The webapp uses the Grokbot webhook for Google Sheets operations. Server-only settings are `GROKBOT_WEBHOOK_URL` and `GROKBOT_WEBHOOK_SECRET`.

The current rollout edits MAD Buying, spreadsheet `1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk`, ledger tab ID `1042918180`. Use the verified Google connection `admin.manilaautodisplay@gmail.com`. The audit tab ID is `2133354940`.

Custodian approval displays a bound preview of the reviewed expense lines. Confirmation records approval and a durable pending delivery. Grokbot receives the saved values, writes the expenses, verifies the result and returns an authenticated callback. A verified completion updates the saved sheet delivery report.

Accounting and independent Approver approval queue a green replenishment marker in the same continuous ledger. The sequence starts at #01. Cash handover uses the same replenishment identity.

Operations are dispatched serially. Each run claims a runner UUID before editing. Retries retain the operation identity and reconcile prior results. An uncertain webhook acknowledgement remains active for investigation. Read-only refreshes return a complete bounded snapshot to update the Buying dashboard mirror. Existing historical workbook data remains stored.

Admin Google Sheets settings include a controlled simulation with labeled temporary expense and replenishment entries. It requires the original empty ledger and ₱40,000 beginning balance, verifies encoding, restores its ledger cells and retains audit history.

Paste the full instructions in [GROKBOT_BUYING_ROUTINE.md](GROKBOT_BUYING_ROUTINE.md) into the bot's saved routine after changing the protocol. Review blocked, failed and uncertain jobs before retrying them.
