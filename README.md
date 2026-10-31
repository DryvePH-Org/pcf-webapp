# Petty Cash Fund and Voucher App

Web app for an imprest petty cash fund: vouchers with receipts, approvals, cash
release, live balance, replenishment, and an audit trail.

See [`docs/petty-cash-app-plan.md`](docs/petty-cash-app-plan.md) for the full
build plan (single source of truth).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage, RLS) · react-hook-form + zod · Recharts ·
Vitest · Playwright · pnpm.

## Local setup

Prerequisites: Node 22+, pnpm 12+, Supabase CLI.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
supabase login
supabase link --project-ref vnjilvzipoykqwtihkce
pnpm dev
```

Open http://localhost:3000.

Environment variables:

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Publishable (or anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Never expose or prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_TIMEZONE` | client + server | `Asia/Manila` |

### Database

Migrations live in `supabase/migrations` (added in Phase 1). Apply them with:

```bash
supabase db push
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest |

## Deploy (Netlify, free tier)

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build command `pnpm build`; publish directory `.next` (from `netlify.toml`).
4. Add the environment variables above in **Site configuration → Environment
   variables**. Store `SUPABASE_SERVICE_ROLE_KEY` with the **secret** flag so it
   is server-only.
5. Deploy.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, and tests on every push to
`main` and on pull requests.

## Decisions (plan rule 10)

- shadcn/ui v4 no longer ships a `form` component; forms use `field` +
  `react-hook-form` instead.
- The Supabase publishable key (`sb_publishable_...`) is used in place of the
  legacy anon key; `@supabase/ssr` accepts it.
