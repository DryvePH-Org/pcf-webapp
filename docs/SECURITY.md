# Security

What protects this app, what to check after deploying, and what is still your
job. No system is "unhackable"; this is defence in depth so that one mistake
does not become a breach.

## What is in place

**Who can do what**
- Sign-in is passwordless: a 6-digit code emailed to an account an admin created.
  Unknown emails get the same reply as known ones (no account probing).
- Roles (admin, custodian, approver, accounting) are enforced in the database
  by Row Level Security and by functions that check the caller's role on every
  call, not only in the screens. Approvers cannot approve their own vouchers.
- Anonymous visitors can read nothing and call nothing (tested).
- The service key never reaches the browser; it is used only on the server.

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
- Receipts: images only (JPEG/PNG/WebP, 5 MB) in a private bucket; viewed
  through short-lived signed links. AI output from photos is treated as
  untrusted text and cleaned like typed input.
- Database error details are never shown to users (`src/lib/db-error.ts`).

**Abuse limits** (`check_rate_limit`, phase 16)
- Sign-in codes: 3 per email and 10 per address every 10 minutes.
- Code guesses: 8 per email and 30 per address every 10 minutes.
- Receipt scans: 6 a minute, 150 a day per person. Voucher creation: 40 a minute.

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
3. **Authentication → Rate Limits / Email:** keep OTP expiry at 3600 s or less
   and the default rate limits on.
4. **Project Settings → API Keys:** only the new publishable/secret keys, legacy
   keys disabled. **Database:** consider restricting network access if you do
   not need direct connections.
5. Turn on **backups** (Pro plan has daily backups) and test a restore once.

## Known and accepted

- `pnpm audit` reports 4 issues in build/dev tooling only (`glob`, `minimatch`,
  `deepmerge` inside the OpenNext build and shadcn CLIs). They do not run in the
  deployed Worker. One has no patched release. Revisit when the tools update.
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
