# Google Drive voucher photo copies

## Google sign-in with a key file

### One-time setup (about 10 minutes)

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
6. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `GOOGLE_REFRESH_TOKEN` in the PCF service's private environment on the VPS.
7. Restart the service. Save a voucher with a photo and look for the
   **Petty Cash Vouchers** folder in your Drive.

Without the three settings the feature is simply off.

## Good to know

- Only photos saved **after** setup are copied. Older receipts are not
  back-filled.
- Replacing a receipt copies the new photo as an additional file.
- To stop copying, remove the Google integration variables from the service environment and restart, or
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
