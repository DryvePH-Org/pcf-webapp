# Petty Cash Fund and Voucher App: Build Plan

> This document is the single source of truth for an AI coding agent. Build phase by phase, in order. Do not skip phases. Do not add features that are not in this plan.

---

## 0. How to use this plan (rules for the AI coding agent)

1. Work on **one phase at a time**. Finish every task and acceptance check in a phase before starting the next.
2. After each phase: run `pnpm lint`, `pnpm typecheck`, `pnpm test`, then make one git commit named `phase-N: <title>`.
3. **Money is `numeric(12,2)` in the database and handled as integer centavos or a decimal library in code.** Never use floating point for money.
4. **Never hard-delete financial records.** Use status `void` with a reason.
5. **All state changes on vouchers and replenishments go through Postgres RPC functions** (section 6). The client never updates `status` directly.
6. **Validate on the server** (zod in server actions or route handlers, plus DB constraints). Client validation is only for UX.
7. **Every screen must work on mobile (360px wide) and desktop (1280px wide).** See section 9.
8. Keep everything on **free tiers** (section 2). Do not add paid services.
9. Timezone is `Asia/Manila`. Currency is PHP (`₱`). Format with `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`.
10. If a requirement is ambiguous, choose the simplest option that matches this plan and leave a `// DECISION:` comment.

---

## 1. Product summary

A web app that replaces the manual petty cash process:

- A fixed **imprest fund** (example: ₱10,000) is held by a **custodian**.
- Every expense is recorded as a **petty cash voucher (PCV)** with a receipt photo.
- An **approver** approves before cash is released.
- The system always shows the live check: **cash on hand + released vouchers = fund amount**.
- When cash runs low, the custodian bundles released vouchers into a **replenishment request**. **Accounting** reviews it and the fund is restored.
- Every action is logged in an **audit trail**.

### Roles

| Role | Can do |
|---|---|
| `admin` | Manage users, funds, categories. View everything. Override void. |
| `custodian` | Create and submit vouchers, attach receipts, release cash, count cash, request replenishment. |
| `approver` | Approve or reject submitted vouchers. Cannot approve a voucher they prepared. |
| `accounting` | Review replenishment requests, view reports and audit trail. |

Employees who ask for cash do **not** need accounts in the MVP. The custodian records the employee as the `payee`.

### Voucher states

`draft → submitted → approved → released → closed`
Side states: `rejected` (returns to editable, can resubmit), `void` (terminal, needs reason).

### Replenishment states

`draft → submitted → approved → closed`
Side state: `rejected` (vouchers return to the pool).

---

## 2. Tech stack (all free tier)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms and validation | react-hook-form + zod |
| Database, auth, storage | Supabase (Postgres, Auth, Storage, Row Level Security) |
| Supabase client | `@supabase/ssr` and `@supabase/supabase-js` |
| Charts | Recharts |
| Image compression | `browser-image-compression` |
| PWA | Serwist (service worker + manifest) |
| Dates | date-fns + date-fns-tz |
| Tests | Vitest (unit), Playwright (e2e smoke) |
| Package manager | pnpm |
| Hosting | **Netlify** (free tier allows commercial use). Cloudflare Pages is the alternative. Do not use Vercel Hobby for a company deployment. |
| Source control and CI | GitHub + GitHub Actions |
| Email (later, optional) | Resend free tier |

### Free-tier risks and the required fixes

| Risk | Required fix |
|---|---|
| Supabase pauses inactive projects after about a week | Phase 10 adds a GitHub Actions cron that calls `/api/health` every 3 days. |
| Supabase Storage is limited (about 1 GB free) | Compress every receipt to about 200 KB before upload (Phase 4). |
| Free-tier limits can change | Check current limits before launch. |

---

## 3. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never exposed to the client
NEXT_PUBLIC_APP_TIMEZONE=Asia/Manila
```

Provide `.env.example`. Never commit `.env.local`.

---

## 4. Project structure

```
/src
  /app
    /(auth)/login/page.tsx
    /(app)/layout.tsx                  # responsive shell (section 9)
    /(app)/dashboard/page.tsx
    /(app)/vouchers/page.tsx
    /(app)/vouchers/new/page.tsx
    /(app)/vouchers/[id]/page.tsx
    /(app)/approvals/page.tsx
    /(app)/replenishments/page.tsx
    /(app)/replenishments/[id]/page.tsx
    /(app)/cash-count/page.tsx
    /(app)/reports/page.tsx
    /(app)/audit/page.tsx
    /(app)/admin/users/page.tsx
    /(app)/admin/funds/page.tsx
    /(app)/admin/categories/page.tsx
    /api/health/route.ts
  /components
    /ui                                # shadcn
    /layout                            # AppShell, SidebarNav, BottomTabBar, PageHeader
    /vouchers                          # VoucherForm, VoucherCard, VoucherTable, StatusBadge, ReceiptUploader
    /shared                            # ResponsiveList, MoneyText, EmptyState, ConfirmDialog
  /lib
    /supabase (client.ts, server.ts, middleware.ts)
    /money.ts
    /validators (voucher.ts, fund.ts, replenishment.ts)
    /permissions.ts
  /actions                             # server actions per domain
/supabase
  /migrations                          # numbered SQL files
  /seed.sql
/tests
/.github/workflows (ci.yml, keepalive.yml)
```

---

## 5. Database schema

Create as numbered migrations in `/supabase/migrations`.

### 5.1 Enums and helpers

```sql
create type user_role as enum ('admin','custodian','approver','accounting');
create type voucher_status as enum ('draft','submitted','approved','released','closed','rejected','void');
create type replenishment_status as enum ('draft','submitted','approved','rejected','closed');

create or replace function public.app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
```

### 5.2 Tables

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'custodian',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  per_txn_limit numeric(12,2) not null check (per_txn_limit > 0),
  low_balance_pct int not null default 25 check (low_balance_pct between 1 and 100),
  custodian_id uuid references profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table fund_counters (
  fund_id uuid not null references funds(id),
  year int not null,
  last_no int not null default 0,
  primary key (fund_id, year)
);

create table replenishments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id),
  request_no text not null unique,
  status replenishment_status not null default 'draft',
  total numeric(12,2) not null default 0,
  requested_by uuid references profiles(id),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table vouchers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id),
  pcv_number text not null unique,               -- PCV-2026-0001
  voucher_date date not null default current_date,
  payee text not null,
  particulars text not null,
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references categories(id),
  status voucher_status not null default 'draft',
  receipt_path text,                             -- storage path
  no_receipt_reason text,                        -- required if receipt_path is null at submit
  prepared_by uuid not null references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  released_at timestamptz,
  reject_reason text,
  void_reason text,
  replenishment_id uuid references replenishments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on vouchers (fund_id, status);
create index on vouchers (voucher_date);

create table cash_counts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id),
  counted_cash numeric(12,2) not null check (counted_cash >= 0),
  expected_cash numeric(12,2) not null,
  variance numeric(12,2) generated always as (counted_cash - expected_cash) stored,
  note text,
  counted_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,                          -- insert | update | status_change
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
```

### 5.3 Live balance view

```sql
create view fund_balance_v as
select
  f.id as fund_id,
  f.name,
  f.amount as fund_amount,
  coalesce(sum(v.amount) filter (where v.status = 'released'), 0) as released_vouchers_total,
  f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0) as expected_cash,
  (f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0))
     < f.amount * f.low_balance_pct / 100.0 as is_low
from funds f
left join vouchers v on v.fund_id = f.id
group by f.id;
```

Rule: `expected_cash + released_vouchers_total = fund_amount` must always hold.

### 5.4 Audit trigger

Create one generic trigger function that writes to `audit_log` with `old_data` and `new_data` as `to_jsonb(OLD/NEW)` and `actor_id = auth.uid()`. Attach it to `vouchers`, `replenishments`, `funds`, `cash_counts`, `profiles`. Also write `updated_at = now()` on voucher updates.

### 5.5 Voucher numbering

`next_pcv_number(fund_id)`: upsert into `fund_counters` for the current year with `last_no = last_no + 1 returning last_no` (row lock keeps it safe), then return `format('PCV-%s-%s', year, lpad(last_no::text, 4, '0'))`.

---

## 6. RPC functions (all status changes happen here)

All are `security definer`, set `search_path = public`, check `app_role()`, check the current status, and raise a clear exception on violation.

| Function | Allowed role | From → To | Extra rules |
|---|---|---|---|
| `create_voucher(...)` | custodian, admin | → `draft` | Assigns `pcv_number`. `amount <= fund.per_txn_limit`. |
| `submit_voucher(id)` | custodian, admin | `draft` or `rejected` → `submitted` | Needs `receipt_path` OR `no_receipt_reason`. |
| `approve_voucher(id)` | approver, admin | `submitted` → `approved` | `auth.uid() <> prepared_by`. Sets `approved_by`, `approved_at`. |
| `reject_voucher(id, reason)` | approver, admin | `submitted` → `rejected` | Reason required. |
| `release_voucher(id)` | custodian, admin | `approved` → `released` | Fails if `amount > expected_cash`. Sets `released_at`. |
| `void_voucher(id, reason)` | custodian (own draft/rejected), admin (any not `closed`) | → `void` | Reason required. |
| `create_replenishment(fund_id)` | custodian, admin | → `draft` | Collects all `released` vouchers with `replenishment_id is null`. Fails if none. Sets `total`. |
| `submit_replenishment(id)` | custodian, admin | `draft` → `submitted` | |
| `review_replenishment(id, approve, note)` | accounting, admin | `submitted` → `approved` or `rejected` | If rejected, unlink vouchers (`replenishment_id = null`). |
| `close_replenishment(id)` | accounting, admin | `approved` → `closed` | Sets all linked vouchers to `closed`. This restores expected cash to the fund amount. |
| `record_cash_count(fund_id, counted, note)` | custodian, admin | n/a | Snapshots `expected_cash` from the view. |

---

## 7. Row Level Security

Enable RLS on **every** table.

- `profiles`: authenticated users can `select`. Only `admin` can `insert`/`update` (except a user updating their own `full_name`).
- `funds`, `categories`: authenticated `select`. Only `admin` writes.
- `vouchers`: authenticated `select`. Direct `insert`/`update`/`delete` are **denied**. Only RPCs write.
  - Exception: custodians may `update` non-status fields (`payee`, `particulars`, `amount`, `category_id`, `receipt_path`, `no_receipt_reason`, `voucher_date`) while status is `draft` or `rejected` and `prepared_by = auth.uid()`. Enforce with a trigger that blocks changes to protected columns.
- `replenishments`, `cash_counts`: authenticated `select`. Writes only through RPCs.
- `audit_log`: `select` for `admin` and `accounting` only. No `insert`/`update`/`delete` policy for any client (triggers write it).

### Storage

- Private bucket `receipts`.
- Path format: `{fund_id}/{voucher_id}/{uuid}.jpg`.
- Policies: authenticated `select`. `insert` for `custodian` and `admin`. **No update or delete.**
- Show receipts with short-lived signed URLs only.

---

## 8. Phases

### Phase 0: Project setup

**Goal:** an empty, deployable app.

Tasks
- [ ] Create Next.js app (TypeScript, App Router, Tailwind, ESLint, `src/` dir).
- [ ] Install and init shadcn/ui. Add: button, input, label, select, textarea, dialog, sheet, dropdown-menu, table, badge, card, tabs, toast (sonner), form, skeleton, alert.
- [ ] Install: `@supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers recharts browser-image-compression date-fns date-fns-tz`.
- [ ] Install dev: `vitest @playwright/test`.
- [ ] Add scripts: `lint`, `typecheck`, `test`.
- [ ] Create Supabase project. Set up Supabase CLI and link it.
- [ ] Add `.env.example`, `.gitignore`, README with setup steps.
- [ ] Create GitHub repo. Add `ci.yml` (lint, typecheck, test on push).
- [ ] Connect Netlify to the repo. Add env vars. Confirm first deploy.

Acceptance
- Home page loads on the Netlify URL. CI is green.

---

### Phase 1: Database, RLS, and RPCs

**Goal:** the full backend contract exists and is tested.

Tasks
- [ ] Write migrations for sections 5.1 to 5.5.
- [ ] Write RPCs from section 6.
- [ ] Write RLS policies and storage policies from section 7.
- [ ] Write `seed.sql`: one fund (`Main Petty Cash`, ₱10,000, limit ₱1,000), default categories (Office Supplies, Transportation, Meals, Courier and Delivery, Utilities, Repairs and Maintenance, Miscellaneous), and four test users (one per role).
- [ ] Generate TypeScript types: `supabase gen types typescript` into `/src/lib/database.types.ts`.
- [ ] Write SQL or Vitest integration tests for the RPCs (see section 11).

Acceptance
- Every transition in section 6 works for the right role and fails for the wrong role or wrong state.
- A direct `update vouchers set status = 'released'` from a client is denied.
- `fund_balance_v` equation holds after every test.

---

### Phase 2: Auth, roles, and responsive app shell

**Goal:** users can log in and see a role-aware, responsive layout.

Tasks
- [ ] Supabase Auth with email and password. No public sign-up. Admin creates users.
- [ ] Middleware that refreshes the session and redirects unauthenticated users to `/login`.
- [ ] `/login` page (centered card on mobile, split layout on desktop).
- [ ] `getCurrentUser()` helper returning `{ id, full_name, role }`.
- [ ] `permissions.ts`: map of role → allowed routes and actions. Hide nav items the role cannot use. Also enforce on the server per page.
- [ ] Build `AppShell` (section 9): sidebar on desktop, bottom tab bar on mobile, top header on both.
- [ ] Empty placeholder pages for every route in section 4.

Acceptance
- Each test role sees only its own nav items.
- Visiting a forbidden route redirects to `/dashboard`.
- Layout switches correctly at the `lg` breakpoint.

---

### Phase 3: Admin setup (funds, categories, users)

**Goal:** admin can configure the system.

Tasks
- [ ] `/admin/funds`: list, create, edit (name, amount, per-transaction limit, low-balance %, custodian). Warn before changing the fund amount.
- [ ] `/admin/categories`: list, add, rename, deactivate (never delete).
- [ ] `/admin/users`: list, create user (server action using the service role key), change role, deactivate.
- [ ] Use `ResponsiveList` (table on desktop, cards on mobile).

Acceptance
- Only `admin` can open `/admin/*`.
- Deactivated categories do not appear in the voucher form but still display on old vouchers.

---

### Phase 4: Vouchers (create, receipt, list, detail)

**Goal:** the custodian can record an expense end to end up to submission.

Tasks
- [ ] `VoucherForm`: voucher date, payee, particulars, amount, category, receipt upload, "no receipt" reason field (shown only if no receipt).
- [ ] `ReceiptUploader`:
  - Mobile: opens the camera (`<input type="file" accept="image/*" capture="environment">`).
  - Desktop: file picker and drag-and-drop.
  - Compress in the browser before upload: `maxSizeMB: 0.2`, `maxWidthOrHeight: 1600`, JPEG.
  - Upload to `receipts/{fund_id}/{voucher_id}/{uuid}.jpg`. Show preview and a replace option while in `draft` or `rejected`.
- [ ] Client and server zod validation. Amount must be greater than 0 and at most the fund's per-transaction limit.
- [ ] `/vouchers/new`: create as `draft` (calls `create_voucher`). Buttons: **Save draft** and **Submit** (calls `submit_voucher`).
- [ ] `/vouchers`: list with status filter chips, search (PCV number, payee), date range. Table on desktop, cards on mobile. Paginate (20 per page).
- [ ] `/vouchers/[id]`: full detail, receipt viewer (signed URL, tap to zoom), status timeline (prepared, approved, released), and action buttons by role and state.
- [ ] `StatusBadge` component with one color per status.
- [ ] **Print view** for a PCV (`@media print` CSS): A5/A4 voucher layout with PCV number, date, payee, particulars, amount, category, and signature lines for Prepared by, Approved by, Received by.

Acceptance
- A custodian can create a voucher from a phone with a camera receipt under about 250 KB.
- Amount over the limit is blocked.
- Submitting with neither receipt nor reason is blocked.
- Print preview looks like a real petty cash voucher.

---

### Phase 5: Approval workflow

**Goal:** approvers can clear the queue fast on mobile or desktop.

Tasks
- [ ] `/approvals`: list of `submitted` vouchers, oldest first.
  - Mobile: card list. Tap a card to open the detail as a full-screen sheet with receipt, then **Approve** and **Reject** buttons fixed at the bottom.
  - Desktop: two-pane layout. Queue on the left, selected voucher detail and receipt on the right.
- [ ] Reject requires a reason (dialog). Approve uses a confirm dialog.
- [ ] Block self-approval in the UI and in the RPC.
- [ ] Show rejected vouchers to the custodian with the reason. They can edit and resubmit.
- [ ] Dashboard badge showing the pending approvals count.

Acceptance
- An approver cannot approve their own voucher (error shown).
- Rejected voucher returns to the custodian, editable, with the reason visible.

---

### Phase 6: Release, live balance, and cash count

**Goal:** the imprest equation is always visible and verifiable.

Tasks
- [ ] On an `approved` voucher, the custodian sees **Release cash**. Confirm dialog shows amount and payee. Calls `release_voucher`.
- [ ] `BalanceCard` component (used on the dashboard): fund amount, expected cash on hand, released vouchers total, and a progress bar. Show the equation `cash + vouchers = fund`. Show a **low balance warning** when `is_low`.
- [ ] `/cash-count`: custodian enters the physical cash counted. Show expected cash, then the variance in green (zero) or red (non-zero). Require a note when variance is not zero. Save with `record_cash_count`. Show the history table.
- [ ] Dashboard (role-aware):
  - custodian: balance card, vouchers to release, drafts, rejected items, last cash count.
  - approver: pending approvals, recent decisions.
  - accounting: submitted replenishments, monthly spend.
  - admin: all of the above, compact.

Acceptance
- Releasing a voucher lowers expected cash by exactly its amount.
- Releasing more than expected cash is blocked.
- Variance is computed correctly and requires a note when non-zero.

---

### Phase 7: Replenishment

**Goal:** close the loop and restore the fund.

Tasks
- [ ] `/replenishments`: list with status badges. Button **New replenishment** (custodian): calls `create_replenishment`, which bundles all unlinked `released` vouchers.
- [ ] `/replenishments/[id]`:
  - Summary: request number, total, voucher count, status.
  - Table of included vouchers (cards on mobile) with receipt thumbnails.
  - **Totals by category** section.
  - Custodian: **Submit** while `draft`.
  - Accounting: **Approve** or **Reject** (note required on reject) while `submitted`. After approval, **Mark as replenished and close**.
- [ ] After close, vouchers become `closed` and the balance card shows the full fund again.
- [ ] Print view for the replenishment request (list of PCVs, totals, signature lines).

Acceptance
- Total equals the sum of its vouchers.
- After close, `expected_cash = fund_amount`.
- Rejected replenishment unlinks its vouchers so they can be re-bundled.

---

### Phase 8: Audit trail and reports

**Goal:** transparency and exports.

Tasks
- [ ] `/audit` (admin, accounting): filterable log (entity, action, actor, date range). Show a readable diff of `old_data` vs `new_data`. Paginate.
- [ ] Per-voucher history tab on the voucher detail page (reads the audit log for that entity).
- [ ] `/reports`:
  - Spend by category (bar chart).
  - Spend by month (line chart).
  - Spend by payee (top 10 table).
  - Cash count variance history.
  - Date range filter.
- [ ] **CSV export** for the vouchers list and each report (client-side generation).
- [ ] Charts must be responsive and readable on mobile (horizontal scroll for wide tables only).

Acceptance
- Every status change appears in the audit log with actor and time.
- CSV opens correctly in Excel with `₱` amounts as plain numbers.

---

### Phase 9: PWA and polish

**Goal:** installable, fast, accessible.

Tasks
- [ ] `manifest.webmanifest`: name, short name, icons (192, 512, maskable), `display: standalone`, theme color.
- [ ] Serwist service worker: cache the app shell and static assets only. **Do not cache API data or receipts.** Show an offline page with a clear "you are offline" message. Creating vouchers offline is out of scope.
- [ ] Install prompt button in the header menu.
- [ ] Loading skeletons, empty states, error boundaries, toast feedback on every action.
- [ ] Accessibility: labels on all inputs, focus rings, color contrast AA, tap targets at least 44px on mobile, keyboard navigation on desktop.
- [ ] Dark mode (optional, only if time allows).

Acceptance
- Lighthouse PWA and accessibility scores are good (target 90+).
- App installs on Android and iOS home screens.

---

### Phase 10: Testing, deployment, and keep-alive

**Goal:** production ready at zero cost.

Tasks
- [ ] `/api/health`: runs `select 1` against Supabase, returns `{ ok: true }`.
- [ ] `.github/workflows/keepalive.yml`: scheduled every 3 days (`cron: '0 2 */3 * *'`), `curl` the production `/api/health`. This prevents the Supabase free project from pausing.
- [ ] Playwright smoke test of the happy path (section 11).
- [ ] Production Supabase project: run migrations, create the real admin user, **do not run the test seed**.
- [ ] Netlify production env vars set. Confirm the service role key is server-only.
- [ ] Write `README.md` and `docs/USER_GUIDE.md` (one short page per role).
- [ ] Add a backup note: weekly `pg_dump` or a manual export reminder.

Acceptance
- Full happy path passes on production.
- Keep-alive workflow runs successfully.

---

### Phase 11: Later (only after the MVP is in real use)

Do **not** build these until asked.

1. **Google Drive archive:** a monthly job moves receipts older than N months from Supabase Storage to Google Drive via a service account, stores the Drive link in the database, and keeps the voucher record intact. Build only if storage is nearly full.
2. **Email notifications** (Resend): voucher submitted, approved or rejected, replenishment ready, low balance.
3. **Employee request flow:** employees submit a cash request that the custodian converts into a voucher.
4. **Messenger or Telegram bot** for submitting requests.
5. **Multiple funds** with fund-specific custodians and permissions.
6. **Receipt OCR** to auto-fill amount and payee.

---

## 9. Responsive design spec (mobile and desktop)

Design **mobile-first**. Breakpoints use Tailwind defaults. The key switch is at `lg` (1024px).

### Layout

| Area | Mobile (below `lg`) | Desktop (`lg` and up) |
|---|---|---|
| Navigation | Bottom tab bar (max 5 items, extras in a "More" sheet) | Fixed left sidebar (240px), collapsible |
| Header | Page title and avatar menu | Page title, search, avatar menu, **New voucher** button |
| Content width | Full width, 16px padding | Centered, `max-w-7xl`, 24px to 32px padding |
| Lists | **Cards** (one per row) | **Tables** with sortable columns |
| Forms | Single column, sticky bottom action bar | Two-column grid, actions at the bottom right |
| Dialogs | Bottom sheets (full width) | Centered modals |
| Approvals | Queue, then full-screen detail sheet | Two-pane (queue left, detail right) |
| Dashboard | Stacked cards, balance card first | 12-column grid: balance card, KPIs, charts, recent activity |
| Charts | Full width, simplified labels | Side by side, full labels and tooltips |

### Shared components to build once

- `AppShell`: renders `SidebarNav` or `BottomTabBar` based on breakpoint (use CSS, not JS, where possible).
- `ResponsiveList<T>`: props `columns`, `renderCard`, `rows`. Renders a table on `lg+` and cards below.
- `ResponsiveDialog`: modal on desktop, bottom sheet on mobile.
- `MoneyText`: formats PHP, right-aligned and tabular numbers in tables.
- `StatusBadge`: consistent colors (draft gray, submitted blue, approved teal, released purple, closed green, rejected red, void dark gray).

### UX rules

- Primary action is always reachable with the thumb on mobile (fixed bottom bar).
- Money inputs use `inputmode="decimal"`.
- No horizontal page scroll at 360px width.
- Test every screen at 360px, 768px, 1280px.

---

## 10. Page-by-page summary

| Route | Roles | Purpose |
|---|---|---|
| `/login` | public | Sign in |
| `/dashboard` | all | Role-aware overview and balance card |
| `/vouchers` | all | List, filter, search vouchers |
| `/vouchers/new` | custodian, admin | Create voucher |
| `/vouchers/[id]` | all | Detail, receipt, timeline, actions, print |
| `/approvals` | approver, admin | Review queue |
| `/cash-count` | custodian, admin | Count cash and see variance |
| `/replenishments` | custodian, accounting, admin | List and create requests |
| `/replenishments/[id]` | custodian, accounting, admin | Review, approve, close |
| `/reports` | accounting, admin | Charts and CSV exports |
| `/audit` | accounting, admin | Full audit trail |
| `/admin/*` | admin | Users, funds, categories |

---

## 11. Test plan

### Unit and integration (Vitest)
- Money helpers (no float errors: `0.1 + 0.2` cases).
- zod validators (limit, required fields).
- Each RPC: allowed role and state succeeds, wrong role fails, wrong state fails.
- Self-approval is blocked.
- Release is blocked when the amount exceeds expected cash.
- Direct client `update` of `status` is denied by RLS.
- Balance equation holds after a sequence of create, approve, release, replenish, close.
- PCV numbers are unique and sequential under concurrent creation.

### End-to-end happy path (Playwright)
1. Custodian logs in and creates a voucher with a receipt, then submits.
2. Approver logs in and approves it.
3. Custodian releases the cash. Balance card drops by the amount.
4. Custodian records a cash count. Variance is zero.
5. Custodian creates and submits a replenishment.
6. Accounting approves and closes it. Balance returns to the full fund.
7. Admin opens the audit log and sees every step.

Run the whole path once at 390px width and once at 1280px width.

---

## 12. Definition of done (MVP)

- [ ] All phases 0 to 10 complete and committed.
- [ ] Happy path passes on mobile and desktop.
- [ ] No status can be changed except through RPCs.
- [ ] The imprest equation is visible on the dashboard and always correct.
- [ ] Every action is in the audit log.
- [ ] Receipts are about 200 KB each and stored privately.
- [ ] Keep-alive cron is running.
- [ ] Total monthly cost is ₱0.
