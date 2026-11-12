# Rollout: custodian self-approval per fund (migration phase 40)

What it adds: a per-fund switch (Funds page, administrators only) that lets the
custodians of that fund approve their own budget request, prepare and release
its voucher, and approve their own liquidation and cash settlement. Every such
step is written to the audit log (action "Self-approved by custodian").
It is off for every fund until an administrator turns it on. A fund that stays
off keeps the earlier rules: another custodian, or the fund's assigned
approver (phase 39), handles a custodian's own request.

Limits that stay in force: a voucher at or above the fund's approval limit
still needs an approver, and an extra reimbursement still needs an independent
approver.

Rollout (same steps as phase 39):

1. `supabase db push --linked --dry-run` should list only
   `20261112180000_phase40_custodian_self_approval.sql`, then
   `supabase db push --linked`.
2. `supabase migration list --linked` shows 20261112180000 on both sides.
3. `python3 scripts/migration-fingerprint.py`, put the value in
   `/opt/pcf/schema.sha256` over SSH, re-run "CI and deploy" on `main`.
4. As an administrator: Funds, then "Allow self-approval" on the funds that
   should have it.
