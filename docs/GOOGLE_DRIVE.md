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

## Option 1: an Apps Script in your own Drive (no admin, no Cloud project)

Use this if you are a member of a Google Workspace and cannot create the Google
Cloud key file. The app sends each photo to a small script you deploy; the
script runs **as you** and saves the file in your Drive.

1. Make a secret and copy it to the clipboard without showing it:
   ```bash
   mkdir -p .secrets && openssl rand -hex 32 > .secrets/drive-script-secret
   ```
2. Open <https://script.google.com/> with your work account → **New project**,
   name it "PCF Voucher Uploads". Replace everything in `Code.gs` with the file
   `apps-script/Code.gs` from this repository (`pbcopy < apps-script/Code.gs`
   copies it).
3. **Project Settings** (gear) → **Script properties** → add
   `UPLOAD_SECRET` = the contents of `.secrets/drive-script-secret`
   (`pbcopy < .secrets/drive-script-secret`, then paste). Optional:
   `ROOT_FOLDER_ID` = the id from the URL of an existing Drive folder you can
   edit (`drive.google.com/drive/folders/<ID>`); without it a **Petty Cash
   Vouchers** folder is created in My Drive.
4. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has
   access **Anyone** → **Deploy**. Approve the permission prompt (*Advanced →
   Go to ... → Allow*). Copy the **Web app URL** (ends in `/exec`).
   - If "Anyone" is not offered, your company blocks it; use Option 2 instead.
   - "Anyone" only means the address can be reached. Nothing is saved without
     the secret, which is long and random.
5. Open the URL in a browser: you should see `{"ok":true,...}`.
6. Set `GOOGLE_SCRIPT_URL` and `GOOGLE_SCRIPT_SECRET` in `.env.local` for
   local use, or in the PCF service's private environment on the VPS.
7. Restart the PCF service and save a voucher with a photo.

If you edit the script later, use **Deploy → Manage deployments → Edit → New
version** so the same URL keeps working.

## Option 2: Google sign-in with a key file

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
