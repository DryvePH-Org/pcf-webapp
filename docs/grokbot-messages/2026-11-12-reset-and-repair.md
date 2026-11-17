# Message to Grokbot: confirm the new routine and repair the Buying ledger (2026-11-12)

Send this **after** you have replaced Grokbot's saved instructions with
`docs/GROKBOT_BUYING_ROUTINE.md` (routine version 2026-11-12.2).

Paste everything below the line into the Grokbot chat.

---

I replaced your saved routine with **version 2026-11-12.2**. The TEMPORARY OVERRIDE from 11 Nov is gone; please don't use it anymore. Confirm you now have version 2026-11-12.2 and no override. Then do this one-time repair.

**Repair of the Buying ledger.**
Spreadsheet `1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk`, ledger tab gid `1042918180`. Use the verified `admin.manilaautodisplay@gmail.com` connection.

**Expected state now:**
- Aaron's ₱1,400.00 entry (PCF# 0001, "Checking Docs with Sir Jep", NCE - FACILITATION (SOP) / VERIFICATION) is on row 9 as expense #3.
- Rows 7 and 8 have no expense details, only stray values: K7 = 12341234, J8 = 10191426, K8 = 009-801-157-001.

The earlier ₱2,000 entries were removed on purpose; do not re-enter them. If the sheet doesn't match the expected state, stop and tell me what you see.

**Steps:**
1. Capture the before-state of B7:O9.
2. Move Aaron's entry from row 9 to row 7. Copy C9:K9 and N9 (values and formats; never column L) into C7:K7 and N7, and set B7 = 1.
3. Clear the stray values J8 and K8. Also clear K7, unless the moved entry has its own TIN.
4. Clear C9:K9 and N9. Leave B8 and B9 as the template's prefilled numbers (2 and 3), and keep the O balance formulas.
5. Check the result:
   - Row 7 is the only expense.
   - O7 shows ₱38,600.00, and the balance stays ₱38,600.00 down the ledger.
   - Rows 8 and 9 hold only template content.
   - The summary and tag-summary formulas still add up.
   - Input VAT is unchanged.
6. Do not edit or delete any existing row in GROKBOT EDIT AUDIT. Directly under its last non-empty row, append three new events for this repair: `planned`, `applied` and `verified`.
   - EVENT = "manual repair".
   - RELATED AUDIT EVENT ID = operation 74065751-c503-4bad-8026-32d714755795.
   - CHANGES lists the move and the cleared cells.
7. Reply here with:
   - the before and after values of B7:O9;
   - the final balance;
   - the audit rows you added.

This repair has no web app operation, so don't call any callback. I'll press "Refresh now" in the web app afterwards.
