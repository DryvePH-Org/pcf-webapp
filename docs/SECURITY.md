# Security

What protects this app, what to check after deploying, and what is still your
job. No system is "unhackable"; this is defence in depth so that one mistake
does not become a breach.

## What is in place

**Who can do what**
- Sign-in uses email and password for an account an admin created. Failed
  credentials and inactive/missing profiles get the same generic reply. Passwords
  are handled by Supabase Auth, never stored in application tables or emails.
- Roles (admin, custodian, approver, accounting, requester) are enforced in the database
  by Row Level Security and by functions that check the caller's role on every
  call, not only in the screens. Approvers cannot approve their own vouchers.
- Anonymous visitors can read nothing and call nothing (tested).
- The service key never reaches the browser; it is used only on the server.

**Budget requests**
- Every active role may submit a request. Fund discovery returns only active fund
  names and assigned custodian names, not balances or other financial records.
- Requesters see only their requests. Assigned custodians can review requests for
  their funds; accounting/admins can see all. Self-review is blocked in the RPC.
- Request records and status changes cannot be written directly by browser clients.
- Approval/conversion locks the request row. Unique voucher linkage prevents
  duplicate conversion; cancellation cannot race past conversion.
- Conversion uses the existing voucher RPC and cash-release workflow. Amounts
  remain bounded by the approved budget even on later draft edits.
- Request approval does not change cash. Audit records include request transitions.

**Liquidation and cash settlement**
- Ownership comes from the linked request or direct voucher preparer; users cannot
  choose another employee or change the advance received.
- Private receipt access uses liquidation ownership/fund permissions. Uploads are
  allowed only while the owner's form is editable. No browser delete/update
  policy can remove a receipt used in a prior submitted version.
- Draft, submitted, flagged, and approved transitions run through authenticated
  RPCs. Every submitted version retains its expense/receipt snapshot.
- Only assigned custodians/admins can review or settle, and never their own forms.
  Approval does not move money. Immutable, unique settlement rows record the
  exact full cash difference once; the fund lock serializes outgoing payments.
- Additional payment uses actual total spending for approval/transaction limits,
  requires independent authorization at the threshold and sufficient cash, and
  is blocked while the voucher is flagged.
- Replenishment snapshots use approved, settled actual expenses. Submission,
  accounting approval, and closing all revalidate the locked batch. Public and
  direct browser writes to the financial tables/RPCs are restricted.
- Released advances cannot be voided to manufacture cash. Only actual returns,
  extra payments, and replenishment confirmation adjust cash on hand.

**Input handling**
- Every text field is cleaned (control, invisible and bidi characters removed,
  `<` and `>` removed, whitespace normalised) and length-limited on the server
  (`src/lib/validators/text.ts`). Names and labels also allow only sensible
  characters. The browser inputs carry matching `maxLength`.
- The database repeats the limits as CHECK constraints (phase 16), so even a
  direct write cannot store oversized or control-character text.
- All database access uses parameterised queries or RPC arguments; nothing
  builds SQL from user text. The one filter string (voucher search) has its
  special characters stripped first.
- React escapes output; emails escape every value; there is no
  `dangerouslySetInnerHTML`.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`).
- Voucher photos: JPEG/PNG/WebP, 5 MB. Liquidation proofs additionally accept
  PDF in a separate private bucket; viewed
  through short-lived signed links. AI output from photos is treated as
  untrusted text and cleaned like typed input.
- Database error details are never shown to users (`src/lib/db-error.ts`).

**Abuse limits** (`check_rate_limit`, phase 16)
- Password sign-in: 8 attempts per email and 30 per address every 10 minutes.
- Voucher creation: 40 a minute.

**Browser protections** (`next.config.ts`, `src/proxy.ts`, `src/lib/csp.ts`)
- Content-Security-Policy with a fresh nonce per request: only scripts the
  server stamped can run, so injected scripts are refused. Also: no framing
  (clickjacking), no plugins, forms post only to this site.
- HSTS, no MIME sniffing, strict referrer policy, camera allowed only for this
  site, powered-by header removed.

## Checks to do in the Supabase dashboard (production)

1. **Authentication → Sign In / Providers → turn OFF "Allow new users to sign
   up".** (Accounts are created by admins only.) Verify with:
   `curl -s -H "apikey: <publishable key>" https://<ref>.supabase.co/auth/v1/settings`
   and look for `"disable_signup": true`.
2. **Authentication → Users:** delete any account you do not recognise
   (for example `nobody-test@example.com`).
3. **Authentication:** enable email/password sign-in and keep authentication
   rate limits on. Assign passwords to existing passwordless accounts.
4. **Project Settings → API Keys:** only the new publishable/secret keys, legacy
   keys disabled. **Database:** consider restricting network access if you do
   not need direct connections.
5. Turn on **backups** (Pro plan has daily backups) and test a restore once.

## Known and accepted

- The rate limiter fails open (lets the request through) if the database is
  unreachable, so an outage cannot lock everyone out. It logs when this happens.
- Cookies are managed by Supabase's SSR helper and readable by the page's own
  JavaScript; the nonce-based CSP is what keeps foreign scripts out.

## Routine

- Rotate keys if one is ever pasted somewhere public. Never commit `.env*`,
  `.dev.vars`, `.secrets/` or database backups (all are git-ignored).
- Run `pnpm audit` now and then, and keep dependencies updated.
- After changing the CSP or headers, run `pnpm test:e2e` against a production
  build (`next build && next start`) and check the browser console for
  "Refused to ..." messages.
