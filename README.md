# Petty Cash Fund and Voucher App

Web app for an imprest petty cash fund: vouchers with receipts, approvals, cash
release, live balance, replenishment, and an audit trail.

- Build plan and decision records: [`docs/petty-cash-app-plan.md`](docs/petty-cash-app-plan.md)
- How each role uses the app: [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)
- Live site: https://pcf-webapp.aaron-custodio.workers.dev

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage, RLS) · Cloudflare Workers
(`@opennextjs/cloudflare`) · Resend (sign-in emails) · react-hook-form + zod ·
Recharts · Vitest · Playwright · pnpm.

## Two Supabase projects

| | Project | Used by | Data |
|---|---|---|---|
| Development / test | `PCFproject` (`qjfbeaeqeorpllvfrgpg`) | local dev, tests | seeded `@pcf.local` users, throwaway vouchers |
| Production | `PCFprojectProd` (`ltkzkgkvxztjxwqtnklj`) | the live site | real data only, never seeded |

`.env.local` points at the **development** project. `pnpm run deploy` builds
against **production** (it pins the production URL and publishable key, since
`NEXT_PUBLIC_*` values are inlined into the bundle at build time).

## Local setup

Prerequisites: Node 22+, pnpm 12+, Supabase CLI.

```bash
pnpm install
cp .env.example .env.local   # fill in the development project's values
pnpm dev
```

Open http://localhost:3000.

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_TIMEZONE` | client + server | `Asia/Manila` |
| `RESEND_API_KEY` | server only | Sends the sign-in code emails |
| `RESEND_FROM` | server only, optional | Sender, e.g. `Petty Cash <noreply@your-domain>`; defaults to Resend's shared test sender |
| `APP_URL` | server only, optional | Base URL used in email links; defaults to the live site |
| `CRON_SECRET` | server only | Protects `/api/cron/digest`; must match the GitHub secret of the same name |
| `NOTIFY_REDIRECT_TO` | dev only | Sends every notification to this one address (subject shows the intended recipient). Set it in `.env.local` so test accounts never email anyone |

Local preview in the Workers runtime also reads `.dev.vars` (gitignored).

## Signing in

There are no passwords. An admin creates a user (email + role) under
**Admin → Users**; the user enters their email on the login page and types the
8-digit code that arrives by email. Only emails with an active, admin-created
account get a code.

Until a sending domain is verified in Resend, the shared sender only delivers
to the Resend account owner, so other staff can't receive codes. Verify a domain
in Resend, then set `RESEND_FROM` to an address on it.

For tests and local work, the `@pcf.local` seed accounts can't receive email;
the Playwright helpers sign them in by generating a code with the Admin API.

## Email notifications

Emails are sent through Resend from the server actions, after the response, so a
slow or failing email never blocks or breaks the action. Every attempt is
recorded in `notification_log` and shown to admins at **Admin → Notifications**.

| Event | Who is told |
|---|---|
| Voucher released | Approvers — needs review |
| Voucher approved | The person who prepared it |
| Voucher flagged | Preparer + admins (with the reason) |
| Voucher voided | Preparer + admins (with the reason) |
| Replenishment submitted | Accounting — needs review |
| Replenishment approved | The requester |
| Replenishment rejected | Requester + admins (with the note) |
| Replenishment closed | Requester + admins — fund restored |
| Fund drops below its warning level | The fund's custodian + admins + accounting |
| Cash count doesn't match | Admins + accounting |
| User created / role changed / access changed | That user |
| Daily summary (08:00 Manila) | Each role, only if something is waiting on them |

The person who performed an action is never emailed about it.

The daily summary is triggered by `.github/workflows/daily-digest.yml`, which
calls `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET`. Set the
same secret on the Worker and in GitHub (**Settings → Secrets → Actions**), then
run the workflow once by hand to check it.

Delivery to anyone but the Resend account owner needs a verified sending domain
(see Signing in). Failures show up in **Admin → Notifications** until then.

## Database

Migrations live in `supabase/migrations`.

```bash
supabase link --project-ref <ref>
SUPABASE_DB_PASSWORD=... supabase db push --linked
```

**Development only** — seed a fund, categories, and one test user per role:

```bash
supabase db query --linked -f supabase/seed.sql
```

**Production** — never run `seed.sql`. Insert categories, then create the first
admin through the Admin API (`auth.admin.createUser` with `email_confirm: true`)
and add a matching `profiles` row with `role = 'admin'`. Create the fund from
**Admin → Funds**.

Regenerate types after schema changes:

```bash
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Next.js production build |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Vitest (set `RUN_DB_TESTS=true` in `.env.local` for the RPC/RLS suite) |
| `pnpm test:e2e` | Playwright (see below) |
| `pnpm preview` | Build and run in the Workers runtime locally |
| `pnpm run deploy` | Build against production and deploy to Cloudflare |

### End-to-end tests

```bash
# Public checks against the live site (read-only, safe on production)
E2E_BASE_URL=https://pcf-webapp.aaron-custodio.workers.dev pnpm test:e2e

# Full happy path + layout checks against the DEVELOPMENT project
E2E_AUTHENTICATED=true pnpm test:e2e
```

The authenticated run wipes vouchers, replenishments, and cash counts in the
project that `.env.local` points to, and refuses to run if that is production.

## Deploying

Deploys are manual. Secrets live on the Worker, not in git.

```bash
pnpm wrangler login                       # once
pnpm wrangler secret put <NAME>           # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                                          # NEXT_PUBLIC_APP_TIMEZONE, SUPABASE_SERVICE_ROLE_KEY,
                                          # RESEND_API_KEY, CRON_SECRET
pnpm run deploy
```

Type the secret **name** as the argument and paste the **value** at the prompt.
CI (`.github/workflows/ci.yml`) runs lint, typecheck, and unit tests on every
push to `main` and on pull requests.

## Keep-alive

Supabase pauses free projects after about a week without activity.
`.github/workflows/keepalive.yml` calls `/api/health` every 3 days, which runs a
real query against the production database. Run it by hand from the Actions
tab (**Keep-alive → Run workflow**) to verify.

## Backups

Supabase's free plan has no automatic backups, so back up regularly:

- **Weekly** (set a calendar reminder): run
  `SUPABASE_DB_PASSWORD=... supabase db dump --linked -f backup-$(date +%F).sql`
  against the production project and store the file somewhere private (not in
  git).
- **Receipts** live in the private `receipts` Storage bucket and are not in the
  database dump. Download the bucket from Supabase → Storage periodically.
- Financial records are never hard-deleted (vouchers are voided with a reason),
  so the audit log plus a recent dump is enough to reconstruct history.

## Decisions (plan rule 10)

- shadcn/ui v4 no longer ships a `form` component; forms use `field` +
  `react-hook-form` instead.
- The Supabase publishable key (`sb_publishable_...`) is used in place of the
  legacy anon key; `@supabase/ssr` accepts it.
- Voucher and replenishment state changes go through `security definer` RPCs;
  the only direct client write allowed on `vouchers` is editing descriptive
  fields on your own draft/rejected rows, guarded by a column trigger.
- Replenishment request numbers use a Postgres sequence (the plan only
  requires uniqueness); PCV numbers use `fund_counters` per fund and year.
- Hosting and sign-in decisions are recorded in the plan document.
