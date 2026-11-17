# Message to the DRYVE Grokbot: confirm the routine, then repair the sheet (2026-11-12)

Send this **after** you have created the new DRYVE Grokbot automation and saved
`docs/GROKBOT_DRYVE_ROUTINE.md` (routine version 2026-11-12.1) as its instructions.

Paste everything below the line into the DRYVE Grokbot chat.

---

I saved the **DRYVE** routine, version **2026-11-12.1**, as your instructions. Confirm that this is the only routine you have and that it names the DRYVE destination below. Then do this one-time setup and repair.

**Destination.**
Spreadsheet `1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ`, tab `DRYVE PCF - NOV TO DEC 2026`, gid `1251133408`. Use the verified `admin.manilaautodisplay@gmail.com` connection. Touch only this tab and the audit tab. Do not edit any other tab.

**Expected state now:**
- The ledger (rows 8 to 62) is empty. BALANCE is ₱50,000.00 on every ledger row; N5 (TOTAL IN) is ₱50,000.00, O5 is ₱0.00, P5 is ₱50,000.00.
- D8:D62 (EXPENSE TYPE) has data validation from **three different lists**: D8:D14, D21:D30 and D42:D45 use `'REPLENISHMENT#10 - SEPTEMBER 20'!$N$9:$N$56`; D15:D16 uses `'REPLENISHMENT#9 - AUGUST 2026'!$N$9:$N$38`; D17:D20, D31:D41 and D46:D62 use this tab's `$N$10:$N$57`.
- Q11 and E84 (REPAIRS AND MAINTENANCE) sum over `$K$8:$K$562`; the other SUMIF cells use `$K$8:$K$62`.
- L71 (CASH ON HAND) is `=N5`.

If the sheet does not match, stop and tell me what you see.

**Steps:**
1. Create the `GROKBOT EDIT AUDIT` tab if it is missing (headers A1:V1 as in the routine), and note its numeric tab ID.
2. Capture the before-state of: the data validation rules on D8:D62, and the formulas in Q11, E84 and L71.
3. Replace the data validation on **D8:D62** with **one** rule: a dropdown list from the range `$N$10:$N$39` of this same tab, showing the dropdown and rejecting any other value. Remove the three old rules. Do not change any cell value in D8:D62.
4. Set Q11 to `=SUMIF($D$8:$D$62,"REPAIRS AND MAINTENANCE",$K$8:$K$62)` and E84 to `=SUMIF($D$8:$D$62,"REPAIRS AND MAINTENANCE",$K$8:$K$62)`.
5. Set L71 to `=P5`.
6. Check the result:
   - Every cell D8:D62 offers exactly the 30 expense types from N10:N39 and nothing else.
   - All 30 SUMIF formulas in Q10:Q39 and in E83:E112 use `$D$8:$D$62` and `$K$8:$K$62`.
   - P5 is still ₱50,000.00 and L71 shows ₱50,000.00.
   - No other cell, tab, or format changed.
7. Do not edit or delete any existing audit row. Directly under the last non-empty row, append `planned`, `applied` and `verified` events with EVENT = "repair" and a CHANGES summary of the rules and formulas you changed.
8. Reply here with:
   - the before and after validation rules and formulas;
   - the audit tab ID and the audit rows you added;
   - any warnings.

This repair has no web app operation, so don't call any callback.
