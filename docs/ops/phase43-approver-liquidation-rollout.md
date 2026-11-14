# Rollout: the assigned approver reviews a custodian's own liquidation (migration phase 43)

## What changes
For a custodian's own request and liquidation, either of these can now approve it
(an administrator always can):
- the **custodian herself**, where the fund allows self-approval (phase 40);
- the fund's **assigned approver** (phases 39 and 43), whether or not self-approval is also on.

The approver now covers the whole chain for a custodian-owned item: the request, the
voucher (prepare and release), the receipt review, approving or flagging the
liquidation, the Google Sheets approval (into that custodian's own workbook) and the
cash settlement. An approver who is not assigned to the fund, and the approver of
someone who is not a custodian of the fund, are still refused. The approver of a
liquidation cannot also approve its extra reimbursement (that still needs an
independent approver).

## Steps (same as phases 39 to 42)
1. `supabase db push --linked --dry-run` should list only
   `20261114100000_phase43_approver_liquidation_gateway.sql`, then
   `supabase db push --linked`.
2. `supabase migration list --linked` shows 20261114100000 on both sides.
3. `python3 scripts/migration-fingerprint.py`, put the value in
   `/opt/pcf/schema.sha256` over SSH, re-run "CI and deploy" on `main`.
