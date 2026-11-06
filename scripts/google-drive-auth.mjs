// One-time setup: lets the app copy voucher photos to YOUR Google Drive.
//
//   node scripts/google-drive-auth.mjs path/to/client_secret_XXXX.json
//
// 1. Opens Google's consent page in your browser (scope: drive.file, so the app
//    can only see the files and folders it creates itself).
// 2. Receives the answer on http://127.0.0.1:53682 (this computer only).
// 3. Saves the three secrets to .secrets/ (git-ignored) and adds them to
//    .env.local. Nothing is printed. Then configure the server environment with the
//    commands this script ends with.
import { execFile } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: node scripts/google-drive-auth.mjs path/to/client_secret_XXXX.json");
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, "utf8"));
const client = raw.installed ?? raw.web;
if (!client?.client_id || !client?.client_secret) {
  console.error("That file does not look like an OAuth client file (Desktop app).");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", REDIRECT);
    if (url.searchParams.get("state") !== state) {
      res.writeHead(400).end("Wrong state");
      return;
    }
    const got = url.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(got ? "Done. You can close this tab and go back to the terminal." : "No code received.");
    server.close();
    if (got) resolve(got);
    else reject(new Error(url.searchParams.get("error") ?? "No code"));
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log("Opening your browser to sign in with Google...");
    console.log("If it does not open, copy this address into a browser:\n" + authUrl + "\n");
    execFile("open", [authUrl], () => {});
  });
  setTimeout(() => reject(new Error("Timed out after 5 minutes")), 300_000).unref();
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});
const tokens = await response.json();
if (!tokens.refresh_token) {
  console.error(
    "Google did not return a refresh token. Remove the app at https://myaccount.google.com/permissions and run this again.",
  );
  process.exit(1);
}

mkdirSync(".secrets", { recursive: true });
const values = {
  GOOGLE_CLIENT_ID: client.client_id,
  GOOGLE_CLIENT_SECRET: client.client_secret,
  GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
};
for (const [name, value] of Object.entries(values)) {
  const path = `.secrets/${name.toLowerCase().replaceAll("_", "-")}`;
  writeFileSync(path, value);
  chmodSync(path, 0o600);
}
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
for (const [name, value] of Object.entries(values)) {
  if (!new RegExp(`^${name}=.+`, "m").test(env)) appendFileSync(".env.local", `\n${name}=${value}\n`);
}

console.log(`
Saved to .secrets/ and .env.local (nothing printed).
For VPS deployment, configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
GOOGLE_REFRESH_TOKEN in the PCF service's private environment, then restart it.
Do not print or commit these values.
`);
