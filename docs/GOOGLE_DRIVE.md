# Copying voucher photos to Google Drive

When set up, every photo saved with a voucher (the store **receipt** and the
**paper voucher** that was scanned) is also copied to your Google Drive:

```
My Drive / Petty Cash Vouchers / <Fund name> / <year-month> / PCV-2026-0001-receipt-2026-11-03.jpg
```

The app keeps its own private copy as well, so a Drive problem never stops
anyone from working. Copies happen in the background; if one fails it is only
logged and the voucher is unaffected. The voucher page shows a "Google Drive"
link once the copy exists.

The app signs in once as **you** (with a refresh token) and uses the narrow
`drive.file` permission: it can only see the files and folders it created
itself, never the rest of your Drive. Files count against your Drive storage.

## One-time setup (about 10 minutes)

1. Go to <https://console.cloud.google.com/>, create a project (for example
   "PCF Vouchers").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - **Google Workspace account (recommended):** choose user type **Internal**.
     Only people in your organisation can use the app, Google needs no review,
     there is nothing to publish, and the sign-in does not expire. App name
     "PCF Vouchers", your email as contact.
   - Personal Gmail instead: choose **External** and then **Publish app**
     (Audience → "In production"), otherwise the sign-in expires after 7 days.
     You may see an "unverified app" warning; choose *Advanced → continue*.
   - Data access / Scopes: add `.../auth/drive.file`.
4. **Credentials → Create credentials → OAuth client ID** → type **Desktop
   app** → **Download JSON**. Save it as `.secrets/client_secret.json` (the
   folder is git-ignored).
5. In the project folder run:
   ```bash
   node scripts/google-drive-auth.mjs .secrets/client_secret.json
   ```
   Sign in with the Google account whose Drive should hold the files and allow
   access. The script saves the secrets to `.secrets/` and `.env.local` without
   printing them.
6. Send them to Cloudflare (production), one at a time:
   ```bash
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID < .secrets/google-client-id
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET < .secrets/google-client-secret
   pnpm exec wrangler secret put GOOGLE_REFRESH_TOKEN < .secrets/google-refresh-token
   ```
7. Deploy (`pnpm run deploy`). Save a voucher with a photo and look for the
   **Petty Cash Vouchers** folder in your Drive.

Without the three settings the feature is simply off.

## Good to know

- Only photos saved **after** setup are copied. Older receipts are not
  back-filled.
- Replacing a receipt copies the new photo as an additional file.
- To stop copying, remove the three secrets (`wrangler secret delete NAME`) or
  revoke access at <https://myaccount.google.com/permissions>.
- If the refresh token is ever lost or revoked, run step 5 again and re-upload
  `GOOGLE_REFRESH_TOKEN`.
- Photos in Drive are only as private as that Drive folder: do not share it
  widely. To let colleagues see the copies, share the **Petty Cash Vouchers**
  folder with them from Drive. You can also move that folder into a Shared
  Drive; the app keeps writing to it.
- If your Workspace administrator blocks third-party or internal apps, ask them
  to allow the OAuth client (Admin console → Security → API controls), or use
  an administrator's account for step 5.
