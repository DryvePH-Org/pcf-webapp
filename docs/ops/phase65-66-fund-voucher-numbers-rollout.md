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

The bot messages of phase 65 (a plain prefix) were replaced by the phase 66 messages below, which carry the full
old-to-new list. Do not send the phase 65 messages again.

---

# Phase 66: the numbers follow the printed liquidation forms

The custodian had already printed the liquidation forms, and they carry the old app number (`PCV-2026-0035`). Phase 65
matched the sheet's own numbers instead, so the paper files and the app did not match. Phase 66 sets the digits to the
printed number, with the fund's letters: `PCV-2026-0035` in Buying becomes `B-0035`, DRYVE's `PCV-2026-0044` becomes
`D-0044`, and the Operations voucher becomes `OPR-0047`. Each fund skips the numbers that belonged to the other
funds in the old shared counter, as the printed forms do. Next numbers: `B-0053`, `D-0052`, `OPR-0048`. The number
from phase 65 stays in `previous_number`, so a search still finds it.

## Order

1. Check no voucher was made since phase 65. A voucher made after phase 65 has no printed form, so it is given the
   next number of its fund after the printed ones. This query should return nothing; if it lists a voucher that was
   already written to a sheet, tell me before you run the migration:
   ```sql
   select f.name, v.pcv_number, v.status, v.created_at::date from vouchers v join funds f on f.id = v.fund_id
   where v.previous_number is null order by v.created_at;
   ```
2. Check the Sheet queue is empty. Do not approve liquidations until both bots have finished.
3. Run the migration `20261202100000_phase66_numbers_follow_printed_forms.sql`, write the fingerprint, re-run the deploy.
4. Send the two messages below, Buying first, then **Read the sheet now** on each workbook card.

## Message for the Buying bot

```
One-time job. This is NOT a pcf.liquidation or pcf.replenishment operation: no operation_id, no callback.

Spreadsheet 1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk, tab "PCF REPLENISHMENT - BUYING (NOV-DEC 2026)"
(sheet_id 1042918180). Work only in this tab.

Column D (header PCF#) holds voucher numbers like B-0001 to B-0038. Replace each one by the number in the list
below. FIRST read every value in column D (rows 8 to the last ledger row) and work out all the new values from
that first reading; THEN write them all in one pass. Do not change them one at a time in place, because some new
values are also old values (for example B-0010 becomes B-0011 and B-0011 becomes B-0014). Write each as literal text.

  B-0001 -> B-0001   B-0002 -> B-0002   B-0003 -> B-0003   B-0004 -> B-0004
  B-0005 -> B-0005   B-0006 -> B-0006   B-0007 -> B-0007   B-0008 -> B-0009
  B-0009 -> B-0010   B-0010 -> B-0011   B-0011 -> B-0014   B-0012 -> B-0015
  B-0013 -> B-0016   B-0014 -> B-0017   B-0015 -> B-0018   B-0016 -> B-0023
  B-0017 -> B-0024   B-0018 -> B-0025   B-0019 -> B-0026   B-0020 -> B-0027
  B-0021 -> B-0028   B-0022 -> B-0029   B-0023 -> B-0030   B-0024 -> B-0031
  B-0025 -> B-0032   B-0026 -> B-0033   B-0027 -> B-0034   B-0028 -> B-0035
  B-0029 -> B-0036   B-0030 -> B-0037   B-0031 -> B-0039   B-0032 -> B-0040
  B-0033 -> B-0041   B-0034 -> B-0042   B-0035 -> B-0048   B-0036 -> B-0049
  B-0037 -> B-0050   B-0038 -> B-0052

Rules:
- A value that is not in the list, and every empty cell, stays exactly as it is. Tell me about any value not in the list.
- Change nothing else: no other column, no formulas, no balances, no other tab, no archived replenishment tab.
- Do not move, add or delete any row.
- Add one line to the GROKBOT EDIT AUDIT tab saying what you changed (tab, column D, how many cells).
- When done, read column D back and reply with: how many cells you changed, the first and last new value, and any
  cell you did not change and why.
```

## Message for the DRYVE bot

```
One-time job. This is NOT a pcf.liquidation or pcf.replenishment operation: no operation_id, no callback.

Spreadsheet 1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ, tab "DRYVE PCF - NOV TO DEC 2026" (sheet_id 1251133408).
Work only in this tab.

Column E (header PCF VOUCHER #) holds voucher numbers like D-0009 to D-0019. Replace each one by the number in the
list below. FIRST read every value in column E (rows 8 to the last ledger row) and work out all the new values from
that first reading; THEN write them all in one pass. Do not change them one at a time in place, because some new
values are also old values (for example D-0010 becomes D-0013 and D-0013 becomes D-0021). Write each as literal
text (plain text cells).

  D-0009 -> D-0012   D-0010 -> D-0013   D-0011 -> D-0019   D-0012 -> D-0020
  D-0013 -> D-0021   D-0014 -> D-0022   D-0015 -> D-0043   D-0016 -> D-0044
  D-0017 -> D-0045   D-0018 -> D-0046   D-0019 -> D-0051

Rules:
- A value that is not in the list, and every empty cell, stays exactly as it is. Tell me about any value not in the list.
- Change nothing else: no other column, no formulas, no balances, no other tab, no archived replenishment tab.
- Do not move, add or delete any row.
- Add one line to the GROKBOT EDIT AUDIT tab saying what you changed (tab, column E, how many cells).
- When done, read column E back and reply with: how many cells you changed, the first and last new value, and any
  cell you did not change and why.
```
