# Rollout: fund approvers (migration phase 39)

What it adds: an admin assigns approvers to a fund. When a custodian of that
fund asks for budget there, the assigned approver reviews the request and
prepares the voucher (another custodian no longer does, once the fund has an
approver). Nobody can release the cash for their own request. Funds without an
assigned approver behave exactly as before.

The app release needs this migration, and the deploy gate stops until the
server's schema fingerprint matches. Do these in order:

1. Apply it to the PCF database from this checkout:

   ```bash
   supabase db push --linked
   ```

2. Check that it is applied (the last row should be 20261112140000):

   ```bash
   supabase migration list --linked
   ```

3. Compute the new fingerprint and install it on the server:

   ```bash
   python3 scripts/migration-fingerprint.py
   ```

   Put that value in `/opt/pcf/schema.sha256` over SSH, then re-run the
   "CI and deploy" workflow on `main`.

4. In the app, as an administrator: Funds, then "Assign approvers" on the fund,
   and pick the approver.

The migration only adds a table and tightens/extends three functions, so the
previous app release keeps working until the new one is deployed.
