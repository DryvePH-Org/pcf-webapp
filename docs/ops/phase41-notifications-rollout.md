# Rollout: in-app notifications and email (migration phase 41)

## What changes
- A bell on every page and a Notifications page (in-app, always on).
- Email only for things that need action, with a per-person on/off and a
  daily send limit (default 90, `EMAIL_DAILY_LIMIT`). When the limit is reached
  the email is skipped and logged as skipped; the bell still shows it.
- Notifications follow the current rules: the fund's other custodians, the
  assigned approver for a custodian's own request, nobody extra when the fund
  allows self-approval; the budget requester is told when their cash is ready.
- The 8:00 summary is per person and now counts budget requests, liquidations
  and due dates. The same job clears old notifications.

## Part 1: the bell (database migration, same steps as phases 39 and 40)
1. `supabase db push --linked --dry-run` should list only
   `20261112200000_phase41_in_app_notifications.sql`, then
   `supabase db push --linked`.
2. `supabase migration list --linked` shows 20261112200000 on both sides.
3. `python3 scripts/migration-fingerprint.py`, put the value in
   `/opt/pcf/schema.sha256` over SSH, re-run "CI and deploy" on `main`.

Email stays off (`NOTIFICATIONS_ENABLED=false`), so only the bell works after
this part.

## Part 2: switch email on
1. Resend: create an account, add the domain `dryveph.io` (Domains), and add the
   DNS records Resend shows (SPF, DKIM, and optionally DMARC) in Hostinger's DNS
   zone editor. Wait until Resend shows the domain as Verified.
2. Create a Resend API key (sending access only).
3. On the server, in `/opt/pcf/.env.runtime`, set:
   `NOTIFICATIONS_ENABLED=true`, `RESEND_API_KEY=...`,
   `RESEND_FROM="Petty Cash <notifications@dryveph.io>"`,
   `APP_URL=https://pcf.dryveph.io`, and optionally `EMAIL_DAILY_LIMIT=90`.
   Keep `CRON_SECRET` as it is.
4. Restart the app and send yourself a test (do an action that notifies you, or
   ask an admin to make a request you must review). Check Admin → Notifications.
5. The 8:00 summary is the GitHub workflow "Daily digest"
   (`.github/workflows/daily-digest.yml`), which calls `/api/cron/digest` with
   the `CRON_SECRET` bearer token. Run it once by hand from the Actions tab to
   confirm it works.
