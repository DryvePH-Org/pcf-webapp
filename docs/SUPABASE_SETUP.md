# Fresh Supabase setup — 2026-11-06

Confirmed project: `pcfwebapp` (`zrnutmybqvmbzxvcdqza`), Sydney region.
API URL: `https://zrnutmybqvmbzxvcdqza.supabase.co`.

## Applied

- Confirmed the project had no public tables, users, or storage buckets.
- Applied all 16 repository migrations through phase 20 in one transaction via
  the Management API. Recorded version, source statements, and name in
  `supabase_migrations.schema_migrations` for subsequent CLI migrations.
- Verified RLS on all 12 application tables and a private `receipts` bucket
  limited to 5 MB JPEG, PNG, and WebP files.
- Disabled public signup while keeping the email/password provider enabled,
  disabled email confirmation, and set the
  minimum password length to eight characters. Admin account creation confirms
  the email explicitly; no code or email delivery is required for login.
- Connected `.env.local` using the project's publishable and
  server-only secret keys. Private backups of previous local settings are in
  the ignored `.secrets/` directory. No credentials belong in source control.
- Linked the Supabase CLI to this project and regenerated database types.
- Added this project's ref to the authenticated E2E production denylist.
  Database-writing test suites remain disabled in local configuration.
- Did not run `seed.sql`: it creates development accounts and sample records.
  Its multiple-custodian assignment was updated for disposable development use.

- First admin created: Aaron (`aaron.custodio@dryve.ph`), with a matching active
  admin profile. Generated credentials are in the ignored, owner-readable
  `.secrets/initial-admin-credentials.txt`; never commit this file.
- Verified real password sign-in, active admin profile access, and public signup
  remaining disabled. Email provider is enabled separately from signup.

## Remaining

- Create the real categories, funds, limits, and custodian assignments.
- Migrations 21–24 are installed: requester, budget requests, liquidation, cash
  settlement, and actual-expense replenishment. History has 21 entries. Private
  liquidation receipts accept JPEG/PNG/WebP/PDF up to 5 MB. Rollback-only tests
  passed and left no fixture users, financial records, or receipt objects.
- Retire legacy cash-count database entry points in a forward migration. The
  application screens/actions have been removed; historical schema remains.
- Configure the final application domain/auth URLs when VPS hosting is ready.
- Configure notification email delivery last. Login does not depend on it.
- Use a separate disposable project for database-writing or authenticated E2E
  tests. Do not seed or reset this project for automated tests.

Cloudflare dependencies, deployment scripts, config, build output, and old QA
artifacts have been removed. The old `.dev.vars` is privately archived under
`.secrets/legacy-cloudflare/`. Scheduled workflows use the repository `APP_URL`
variable and skip if it is unset. The historical SQL backup is preserved under
`.secrets/backups/`. Temporary bootstrap scripts/key dumps were removed after
setup; runtime keys remain in `.env.local` and admin credentials remain private.
The other Supabase project, `SalesInvoice`, was not modified.

Migration 25 is installed: accounting can assign custodians through audited RPCs;
admin-only settings remain protected, and cash-count RPC execution is retired.
No real funds or additional staff were configured without the owner's details.
