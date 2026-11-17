# Message to the DRYVE Grokbot: remove the test entry and make the sheet fresh (2026-11-13)

Send this to the **DRYVE** Grokbot chat only (not the Buying one).

Paste everything below the line into the chat.

---

Please do a one-time reset of `DRYVE PCF - NOV TO DEC 2026` so the sheet is fresh for live use. It is an owner-requested repair under your routine (version 2026-11-12.1). Use the verified `admin.manilaautodisplay@gmail.com` connection and touch only this tab and the audit tab.

**Destination.** Spreadsheet `1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ`, tab `DRYVE PCF - NOV TO DEC 2026`, gid `1251133408`.

**Expected state now (from our test, operation `ad919143-c152-43ce-8313-3f61bc3bf5c5`):**
- Row 8 holds the test entry: A8 = 1, B8 = 2026-11-13, C8 = DRYVE, D8 = ADMIN AND OFFICE SUPPLIES, E8 = `0001` (text), F8 = lunch test, G8 = N/A, H8 = Aaron, I8 = N/A, K8 = 50.
- L8:L62 show ₱49,950.00; O5, K63, L65 and L70 show ₱50.00; P5 and L71 show ₱49,950.00; Q32 and E105 show ₱50.00.
- Rows 9 to 62 are empty template rows. Funding rows 5 to 7 are untouched (L5 ₱5,841.00, J6 ₱38,159.00, J7 ₱6,000.00).

If the sheet does not match, stop and tell me what you see.

**Steps:**
1. Capture the before-state of B8:K8 (values and formats).
2. Clear the **values** of B8, C8, D8, E8, F8, G8, H8, I8 and K8 so row 8 is an empty template row again. Do not touch A8 (it stays `1`), J8, L8, any formula, or any cell format.
3. Set N5 to `=SUM(L5,J6:J62)` (it currently stops at row 58 and your audit warning keeps mentioning it). This is the only formula change.
4. Check the result:
   - B8:K8 are empty and A8 is still 1;
   - L8:L62 all show ₱50,000.00;
   - O5, K63, L65 and L70 show ₱0.00;
   - N5, P5 and L71 show ₱50,000.00;
   - all 60 SUMIF cells (Q10:Q39 and E83:E112) show 0.00 and keep `$D$8:$D$62` and `$K$8:$K$62`;
   - funding rows 5 to 7 and every other tab are unchanged, and the only formula difference from before is N5.
5. Do not edit or delete any existing audit row. Directly under the last non-empty row, append `planned`, `applied` and `verified` events with EVENT = "repair", RELATED AUDIT EVENT ID = `ad919143-c152-43ce-8313-3f61bc3bf5c5-verified-1`, and CHANGES saying the test entry was removed and N5 widened to make the sheet fresh for live use.
6. Reply here with the before and after values, the audit rows you added, and any warnings.

This repair has no web app operation, so don't call any callback.
