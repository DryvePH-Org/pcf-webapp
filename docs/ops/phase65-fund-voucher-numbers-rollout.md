# Phase 65 rollout: voucher numbers with the fund's letters

Vouchers are now numbered per fund with the fund's letters: `B-0039` (Buying), `D-0020` (DRYVE), `OPR-0002`
(Operations Parts & Repairs). The number is made by the database and is the same number the Google Sheet shows.
Existing vouchers keep the digits the sheet already has and gain the letters (`0001` becomes `B-0001`). The old
`PCV-2026-00XX` is kept in `previous_number` and the voucher search still finds it.

## Order

1. Check the **Sheet queue** has nothing waiting, sending or needing attention.
2. Run the migration `20261201100000_phase65_fund_voucher_numbers.sql`, write the fingerprint, push (the usual steps).
3. Once the deploy is live, send the two messages below to the Buying and DRYVE bots, one at a time.
   Operations has no liquidation in its sheet yet, so it needs no message.
4. Ask for a read of each sheet (**Read the sheet now** on the workbook card). The "to check" entries on the
   Accounting page clear when the sheet and the app show the same numbers.

Until step 3 is done, the Accounting page lists the voucher numbers as "to check" (the app says `B-0001`, the sheet
still says `0001`). Nothing is lost. No liquidation should be approved between steps 2 and 3.

## Message for the Buying bot

```
One-time job. This is NOT a pcf.liquidation or pcf.replenishment operation: no operation_id, no callback.

Spreadsheet 1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk, tab "PCF REPLENISHMENT - BUYING (NOV-DEC 2026)"
(sheet_id 1042918180). Work only in this tab.

Column D (header PCF#), from row 8 down to the last ledger row above the totals: the voucher numbers are written
like 0001 to 0038. Change every cell whose value is exactly four digits (or a number that shows as four digits) to
"B-" followed by the same four digits, as literal text. Examples: 0001 becomes B-0001, 0038 becomes B-0038.

Rules:
- Leave empty cells, and any cell that already starts with "B-", exactly as they are.
- Change nothing else: no other column, no formulas, no balances, no other tab, no archived replenishment tab.
- Do not move, add or delete any row.
- Add one line to the GROKBOT EDIT AUDIT tab saying what you changed (tab, column D, how many cells).
- When done, read column D back and reply with: how many cells you changed, the first and last new value, and any
  cell in column D you did not change and why.
```

## Message for the DRYVE bot

```
One-time job. This is NOT a pcf.liquidation or pcf.replenishment operation: no operation_id, no callback.

Spreadsheet 1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ, tab "DRYVE PCF - NOV TO DEC 2026" (sheet_id 1251133408).
Work only in this tab.

Column E (header PCF VOUCHER #), from row 8 down to the last ledger row: the voucher numbers are written like 0009
to 0019, and two rows hold 16 instead of 0016. Change every non-empty cell to "D-" followed by the number padded
to four digits, as literal text (set the cell to plain text). A cell may be text ("0009") or a number that shows
as four digits (9, 16): use the digits, pad with zeros to four. Examples: 0009 becomes D-0009, 16 becomes D-0016.

Rules:
- Leave empty cells, and any cell that already starts with "D-", exactly as they are.
- Change nothing else: no other column, no formulas, no balances, no other tab, no archived replenishment tab.
- Do not move, add or delete any row.
- Add one line to the GROKBOT EDIT AUDIT tab saying what you changed (tab, column E, how many cells).
- When done, read column E back and reply with: how many cells you changed, the first and last new value, and any
  cell in column E you did not change and why.
```

## After

Ask for a fresh export of each sheet. Every voucher in column D (Buying) and column E (DRYVE) should now start with
its fund's letters and match the voucher number in the app. New entries are written by the bots with the new number
(routine version 2026-12-01.1; paste the routines when the Grokbot app allows it, the numbers already arrive in the
job).
