// Minimal Google Drive client (fetch only, so it runs on Cloudflare Workers).
// It signs in with a refresh token the owner granted once (scope drive.file:
// the app can only see files and folders it created itself) and files uploads
// under "Petty Cash Vouchers / <fund> / <year-month>".

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_FOLDER = "Petty Cash Vouchers";

// Two ways in. A Google Apps Script web app the owner deployed (runs as them,
// works inside a company Workspace without admin help), or Google's own API
// with a one-time sign-in (refresh token). The script is preferred if both are set.
function scriptConfigured() {
  return Boolean(process.env.GOOGLE_SCRIPT_URL && process.env.GOOGLE_SCRIPT_SECRET);
}

function oauthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

export function driveConfigured() {
  return scriptConfigured() || oauthConfigured();
}

let cachedToken: { value: string; expiresAt: number } | null = null;
const folderCache = new Map<string, string>();

export function resetDriveCache() {
  cachedToken = null;
  folderCache.clear();
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Google sign-in failed (${response.status})`);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.value;
}

// Names become Drive folder/file names and go into search queries.
export function driveSafeName(name: string) {
  return name
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}

function queryString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
}

async function findOrCreateFolder(token: string, name: string, parentId: string | null) {
  const key = `${parentId ?? "root"}/${name}`;
  const cached = folderCache.get(key);
  if (cached) return cached;

  const q = [
    `name = '${queryString(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const search = await driveFetch(
    `${FILES_URL}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`,
    token,
  );
  if (!search.ok) throw new Error(`Drive folder lookup failed (${search.status})`);
  const found = ((await search.json()) as { files?: { id: string }[] }).files?.[0];
  if (found) {
    folderCache.set(key, found.id);
    return found.id;
  }

  const created = await driveFetch(`${FILES_URL}?fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.ok) throw new Error(`Drive folder creation failed (${created.status})`);
  const id = ((await created.json()) as { id: string }).id;
  folderCache.set(key, id);
  return id;
}

type UploadInput = {
  folders: string[];
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

const DRIVE_URL = /^https:\/\/(drive|docs)\.google\.com\//;

async function uploadViaScript(input: UploadInput) {
  const response = await fetch(process.env.GOOGLE_SCRIPT_URL ?? "", {
    method: "POST",
    // Apps Script answers a POST with a redirect to the result; fetch follows it.
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: process.env.GOOGLE_SCRIPT_SECRET,
      folders: input.folders.map(driveSafeName),
      fileName: driveSafeName(input.fileName),
      mimeType: input.mimeType,
      data: Buffer.from(input.bytes).toString("base64"),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Drive script failed (${response.status})`);
  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; id?: string; url?: string; error?: string }
    | null;
  if (!result?.ok || !result.id || !result.url) {
    throw new Error(`Drive script refused the upload (${result?.error ?? "no answer"})`);
  }
  if (!DRIVE_URL.test(result.url)) throw new Error("Drive script returned an unexpected link");
  return { id: result.id, url: result.url };
}

export async function uploadToDrive(input: UploadInput): Promise<{ id: string; url: string }> {
  if (scriptConfigured()) return uploadViaScript(input);

  const token = await accessToken();

  let parent: string | null = null;
  for (const name of [ROOT_FOLDER, ...input.folders.map(driveSafeName)]) {
    parent = await findOrCreateFolder(token, name, parent);
  }

  const boundary = `pcf-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: driveSafeName(input.fileName),
    parents: parent ? [parent] : undefined,
  });
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + input.bytes.byteLength + tail.length);
  body.set(head, 0);
  body.set(new Uint8Array(input.bytes), head.length);
  body.set(tail, head.length + input.bytes.byteLength);

  const response = await driveFetch(
    `${UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!response.ok) throw new Error(`Drive upload failed (${response.status})`);
  const file = (await response.json()) as { id: string; webViewLink?: string };
  return {
    id: file.id,
    url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
  };
}
