# PCF workflow update

This document records the user's November 2026 requirements. It supersedes
conflicting feature and hosting requirements in the original build plan.

## Confirmed scope

- Keep Supabase for database, authentication, and private attachments.
- Prepare for a shared Hostinger KVM2 VPS with two existing projects. Inspect
  services, ports, reverse proxy, deployment method, and resource use before
  proposing server changes. The VPS has not been inspected or modified.
- Roles: admin, custodian, approver, accounting, requester. Requester can be a
  user's main role; every other role also has requester capabilities.
- Accounting assigns funds to custodians. A fund may have multiple custodians.
- Requesters select a fund with the custodian names displayed, then submit
  their name, requested budget, and purpose.
- A custodian reviews the request and creates a linked voucher, using the
  existing voucher form and optionally prefilling it from the request.
- Keep the current approval boundary: at or above the fund's approval threshold,
  obtain approval before releasing cash. Below it, release is allowed before
  review; approvers can still approve or flag the voucher.
- Cash release decreases expected cash immediately, whether liquidation has
  been approved or not. Liquidation approval must not deduct the advance twice.
- Display liquidation status independently of voucher approval/release status.
- A requester submits a liquidation linked to the original voucher: name,
  department, filing date, multiple particulars and amounts, amount received,
  total spent, and calculated amount to return or reimburse.
- Each liquidation line needs an attachment or a missing-receipt reason.
- Custodians review liquidation and may approve or flag it for correction.
- Omit the proposed accounting-entry and signature/reviewer-name fields.
- Accounting can review all records and supporting attachments, then review
  custodians' replenishment requests and replenish the fund.
- Keep paper voucher photos and the existing Google Drive copy integration.
- Keep CSV export and installable PWA support. Every financial form, including
  the new request and liquidation forms, must have a printable representation.
- Keep notification events, templates, and delivery tracking. Final provider
  integration/configuration comes last. Sign-in now uses email/password and
  does not depend on notification email delivery.
- Google Sheets automation is deferred to a later discussion.
- Remove AI scanning, cash counts, and reports.

## Implementation status

Completed cleanup:

- Replaced OTP/magic-link login with email/password, added admin-set passwords
  to account creation, preserved active-profile checks and rate limits, and
  switched authenticated test helpers to seed passwords. The owner subsequently
  authorized fresh Supabase setup; see `SUPABASE_SETUP.md` for current status.

- Removed AI server action, parser, scanning UI, image preprocessing, and Groq
  configuration examples. Paper photos now use a manual attachment control.
- Removed report and cash-count pages/components/actions, dashboard cash-count
  queries, navigation entries, and cash-count notifications.
- Removed the unused chart dependency and updated the lockfile.
- Removed Cloudflare dependencies/config/deploy commands, generated output,
  unused starter images, and old QA artifacts; kept the standard Node runtime.
  Historical SQL backups and credentials remain in ignored private directories.
- Kept voucher CSV export, voucher/replenishment print views, photo uploads,
  Drive copies, audit history, notification infrastructure, and PWA support.
- Historical cash-count tables, RPCs, generated types, migrations, and audit
  entries remain. Database retirement is not yet implemented; removing screens
  does not revoke the existing database RPC.

Completed budget-request phase:

- Added the standalone requester role; every existing role can request a budget.
- Added limited fund/custodian discovery without exposing another fund's ledger.
- Added requests, custodian review/rejection, requester cancellation, pagination,
  status filters, own-request filtering, printing, and page/detail CSV exports.
- Added atomic conversion of an approved request into one linked voucher, using
  the existing form prefilled with the name, fund, amount, and purpose.
- The requester cannot review or prepare their own requested voucher. Assigned
  custodians or another administrator handle it. Accounting/admins can view all
  requests; approvers/requesters see their own, and custodians see their own and
  requests for assigned funds.
- Voucher totals cannot exceed the approved budget, including later draft edits.
  Existing per-transaction limits and approval thresholds still apply. Request
  approval and draft voucher creation do not move cash.
- Added request notification hooks/templates and retained provider setup for last.
- Installed and tracked migrations 21 and 22 on the confirmed Supabase project.
  Rollback-only SQL tests passed, including RLS, self-review denial, duplicate
  conversion, budget ceilings, approval at the exact threshold, and cash release.
  All test accounts/financial records were rolled back; the project still has
  only Aaron's real account. Browser/mobile rendering has not been verified in
  this execution environment (Turbopack previously failed to bind its local port).

Completed liquidation/settlement/replenishment phase:

- Installed migrations 23/24, bringing tracked migration count to 20.
- One liquidation per released voucher, filed by its requester (or original
  preparer for direct vouchers). Department/date, actual expense lines, private
  JPEG/PNG/WebP/PDF receipts or missing-receipt reasons, printing, CSV, and
  submission/correction history are implemented.
- Custodian/admin review is separate from actual cash settlement. Self-review
  and self-settlement are blocked. The exact full return/reimbursement can be
  recorded once; zero-difference forms need no cash movement. Zero spending
  requires a reason and the full actual cash return closes the advance.
- Additional reimbursement uses the actual total for approval threshold and
  transaction-limit checks, requires sufficient cash, and cannot be paid on a
  flagged voucher. An independent approver handles threshold-reaching totals.
- Balances track actual returns/payments without deducting the advance twice.
  Dashboard shows pending liquidation, returns, and reimbursements separately.
- Accounting can inspect pending/flagged records. Batches contain at most 100
  approved, settled, unflagged liquidations and reimburse actual expenditure.
  Rejected batches retain snapshots; all stages recheck eligibility and totals.
- Released cash cannot be voided away. Unreleased voucher voiding remains.
- New notification hooks/templates are prepared; provider setup is still last.
- Rollback-only SQL checks cover ownership, cross-fund and receipt access,
  correction history, missing proofs, return/reimbursement/no-difference/unused
  advances, independent approval, insufficient cash, duplicate settlement,
  flag-after-batch review, immutable snapshots, and cash reconciliation.
- TypeScript, lint, and 145 unit tests passed. Legacy DB/browser suites remain
  opt-in; fixtures and workflow expectations were updated but not executed here.
  Browser/mobile verification remains blocked by local server port restrictions.
- No sample financial records or fixture accounts remain in the real project.

Launch preparation update:

- Migration 25 is installed and tracked: accounting/admin fund assignments are
  available at `/funds`, assignments are audited, and the old cash-count RPC is
  revoked without deleting historical counts.
- Admins retain fund settings and user administration. Accounting can assign
  multiple custodians but cannot change fund amounts or limits.
- Direct vouchers remain available as an exception. Budget-linked vouchers keep
  their approved ceiling. Existing voucher-level receipts remain available.
- Notification delivery is disabled by default and in the current local runtime.
  The email transport refuses delivery without explicit enablement; the daily
  workflow also requires `NOTIFICATIONS_ENABLED=true`. Login is unaffected.
- The standalone production build passed. Twelve public desktop/mobile checks
  and signed-in admin checks at 1280/390 px passed against the production build.
  The user requested shortened testing; populated financial workflows were
  covered by the earlier rollback-only SQL checks, not a new disposable setup.
- Dockerfile, isolated Compose configuration, private environment templates,
  resource caps, and deployment/backup/rollback runbook are in `deploy/`.
  Compose configuration was validated with placeholder credentials only.
- The app is running locally on http://127.0.0.1:3107. No VPS was accessed or
  modified. SSH host/user/port, authentication, and domain are still required.
- Real funds/staff/categories are not invented. They can be configured by the
  administrator through the app after first launch.

Remaining deployment work:

1. Obtain secure SSH access and the chosen domain/DNS configuration.
2. Inspect both existing projects, proxy, ports, CPU/memory/disk, and architecture.
3. Set actual isolated service limits, private runtime config, HTTPS, image,
   database/storage backups and rollback against that inspected environment.
4. Deploy only PCF; smoke-test it and both existing projects. Notification email
   setup remains skipped at the user's request. Google Sheets remains deferred.

## Decisions still to resolve

- Whether direct voucher creation without a budget request remains available.
- Whether existing voucher-level receipt attachment remains alongside new
  liquidation-line attachments. It is retained for now.
- Admin fund management is retained; accounting can assign custodians.
- Current implemented replenishment rule: approved liquidation and a fully
  settled cash difference. Accounting can still inspect excluded records.
- Current implementation is one liquidation per voucher with correction history,
  and one full-difference settlement. Partial liquidations/payments are deferred.
- Custodians/admins record actual cash movement. Threshold-reaching additional
  reimbursements need independent approver authorization before payment.

Suggested invariants for the next phases: cash changes only on actual recorded
cash movements; no self-approval of liquidation; submitted/approved financial
records are immutable except through audited transitions; concurrent custodians
must not release the same request or replenish the same expense twice.
