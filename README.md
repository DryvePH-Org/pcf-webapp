# Petty Cash Fund and Voucher App

Petty cash management using Next.js 16, React 19, TypeScript, Tailwind CSS 4,
shadcn/ui, and Supabase (Postgres, Auth, private Storage, and RLS).
Hosting target: a shared Hostinger KVM2 VPS running Node.js. Not deployed there yet.

## Current status

Implemented: admin-created email/password accounts, funds with multiple custodians,
vouchers and approval limits, paper voucher photos, replenishments, audit history,
CSV export, voucher/replenishment printing, installable PWA support, and budget
requests with custodian review, linked vouchers, request printing, and CSV.

Removed: AI scanning, cash-count screens, reports, and Cloudflare deployment tooling.
Historical database tables and migrations are retained.

The standalone Requester role, budget requests, liquidation/reimbursement forms,
per-line private receipt uploads, correction history, cash settlement, and
liquidation-based replenishment are implemented. All financial forms have print
views and CSV export. Request/liquidation notification hooks are prepared;
email-provider configuration and delivery verification come last. Google Sheets
automation is deferred. The standalone production build and short desktop/mobile browser smoke tests
passed. Public VPS deployment is waiting for SSH access and the chosen domain.

- [Confirmed workflow and implementation phases](docs/WORKFLOW_UPDATE.md)
- [Fresh Supabase setup](docs/SUPABASE_SETUP.md)
- [Current user guide](docs/USER_GUIDE.md)
- [Design guide](docs/DESIGN.md)
- [Security](docs/SECURITY.md)
- [Google Drive photo copies](docs/GOOGLE_DRIVE.md)
- [Original build plan — historical reference](docs/petty-cash-app-plan.md)

## Local development

Use Node.js 22+ and pnpm 12+.

```bash
pnpm install --frozen-lockfile
# New checkout only: copy .env.example to .env.local and fill in credentials.
# Do not overwrite an existing configured .env.local.
pnpm dev
```

Open http://localhost:3000. Admins create accounts with name, email, password
(8–128 characters), and role. Users sign in directly with email/password; no
code or notification email service is needed. Public signup is disabled.

The configured project is `pcfwebapp` (`zrnutmybqvmbzxvcdqza`). Aaron's initial
administrator is provisioned. Credentials and historical backups are private,
gitignored files under `.secrets/`; do not include them in deployment archives.

## Configuration

See `.env.example` for variables. Required:

- `NEXT_PUBLIC_SUPABASE_URL`: project API URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public/publishable API key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret key; never expose to clients.
- `NEXT_PUBLIC_APP_TIMEZONE`: `Asia/Manila`.

For notifications, configure `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, and
`CRON_SECRET` when delivery is enabled. `NOTIFICATIONS_ENABLED` defaults to false
and remains disabled for this launch. `NOTIFY_REDIRECT_TO` can redirect test
notifications. Google Drive configuration is optional and documented separately.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Local Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production Node server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Regenerate routes and check TypeScript |
| `pnpm test` | Unit tests; database suites are opt-in |
| `pnpm test:e2e` | Browser tests; authenticated suites are opt-in |

`NEXT_PUBLIC_*` variables are embedded at build time. Build with the intended
project configuration. The old Cloudflare deployment commands have been removed.

## Database and tests

Migrations live in `supabase/migrations`. The CLI is linked to the fresh PCF
project. Always confirm the project ref before remote changes. Generate types
from the schema rather than editing `src/lib/database.types.ts` by hand.

Do not run `supabase/seed.sql`, database resets, or database-writing tests against
the real PCF project. The seed is development-only. `RUN_DB_TESTS` defaults to false; leave it false here. Use a
separate disposable project for integration and authenticated browser tests.
Authenticated E2E tests can erase financial data and explicitly deny the real PCF
project. Default CI runs lint, typecheck, and unit tests.

## Deployment and operations

Deployment templates and the runbook are in [`deploy/`](deploy/README.md).
VPS deployment is pending SSH access and inspection of the two existing projects, reverse proxy,
ports, and resource use. Run PCF as an isolated Node service behind HTTPS with its
own environment and process/container limits. Final deployment configuration,
backup schedule, and rollback procedure will be prepared after that inspection.
No VPS services have been changed.

Daily digest and keep-alive workflows use the GitHub repository variable
`APP_URL`; they skip when it is unset. The digest requires repository variable `NOTIFICATIONS_ENABLED=true` and the GitHub secret
`CRON_SECRET`, matching the server. Set these only after the final site is ready.
Notification links use the server's `APP_URL`, defaulting to localhost for development.

Keep database backups and private receipt-storage backups separately. Test a
restore before relying on them; a database dump does not include receipt files.
Never hard-delete financial records. Only unreleased vouchers can be voided;
released cash is resolved through liquidation and recorded cash settlement.

## Automatic deployment

Pushes to `main` run checks, build PCF on GitHub, and deploy only the PCF service
at https://pcf.dryveph.io. Failed health checks restore the previous app image.
See [CI/CD and development instructions](docs/CI_CD.md) for setup, database
migration handling, run logs, and rollback.
