# Phase 68: send a liquidation back, or delete it (administrator)

An administrator can correct a liquidation that was filed wrongly, from the liquidation's own page: **Administrator
correction > Send back or delete…**. It asks for the administrator's own password and a written reason, and writes a
line in `admin_corrections` (who, when, why, what it was).

- **Send back as a draft**: the lines and pictures stay, the owner fixes them and submits again. The custodian review,
  the approval and the Grokbot job are removed.
- **Delete it**: everything in the liquidation is removed. The advance is outstanding again and the owner starts a new
  liquidation.
- It refuses (and says why) when money has moved on: a cash return or reimbursement was recorded, the voucher is in a
  replenishment, or Grokbot is writing it right now.

## If it was already written to the Google Sheet

The app forgets the job, but the rows stay in the sheet until Grokbot clears them. After the correction, send this to
the bot of that fund (change the voucher number and the sheet details for DRYVE or Operations).

```
One-time job. This is NOT a pcf.liquidation or pcf.replenishment operation: no operation_id, no callback.

Spreadsheet 1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk, tab "PCF REPLENISHMENT - BUYING (NOV-DEC 2026)"
(sheet_id 1042918180). Work only in this tab.

Voucher B-0054 was filed wrongly and has been sent back in the app, so its entries must come out of the ledger.

1. Read column D (header PCF#) and find every row whose value is exactly B-0054. Before you change anything, tell me
   each row number with its particular, date, point person, OUT amount and the balance in column O, and the balance
   in column O of the last filled ledger row.
2. In those rows only, clear columns C to N (tag, PCF#, date, particular, plate, point person, company, SI/OR#, TIN,
   input VAT, IN, OUT). Keep the number in column B and the balance formula in column O as they are.
3. Read back: no row has B-0054 any more, the cleared rows are empty from C to N, and the balance of the last filled
   ledger row went up by exactly the sum of the cleared OUT amounts. Tell me both balances.

Rules:
- Change nothing else: no other row, no other column, no formulas, no other tab, no archived replenishment tab.
- Do not move, add or delete any row. The cleared rows are free for the next entry under your usual rules.
- If no row has B-0054, stop and tell me. If a row with B-0054 also holds something that looks like another voucher's
  entry, stop and tell me before clearing.
- Add one line to the GROKBOT EDIT AUDIT tab saying what you cleared (tab, voucher, rows, amounts).
```

Then press **Read the sheet now** on the workbook card. The Sheet queue page and the Accounting page show nothing wrong
once the sheet and the app agree.
