# Development and automatic deployment

Repository: https://github.com/DryvePH-Org/pcf-webapp
Live app: https://pcf.dryveph.io
Runs: https://github.com/DryvePH-Org/pcf-webapp/actions/workflows/ci.yml

Push application changes to `main` to update the live app:

```sh
pnpm lint
pnpm test
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

Pull requests run lint, TypeScript checks, unit tests, and deployment guard tests.
A push to `main` runs those checks, builds the production Linux amd64 image on a
GitHub runner, and streams it over pinned-host SSH to the VPS. No registry token
or build load is needed on the shared VPS. The production environment accepts
only the `main` branch. Deployment jobs are serialized and are not cancelled
while they are changing the running app. You can also select **Run workflow**
on `main` in the Actions page to re-run a deployment.

The VPS validates the uploaded archive contains only `pcf/app:<commit-sha>` and
checks the image architecture and revision label. It recreates only PCF's `app`
service, retaining its resource limits, private network, and runtime settings.
It checks local and public Supabase health, the login page, and the unchanged
container IDs/start times and HTTP responses of both existing projects. A failed
activation restores PCF's previous image ID and checks health again. A deployment
briefly replaces the single PCF container; existing projects stay running.

## Configuration

GitHub repository variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the public publishable key), `PCF_SSH_HOST`,
`PCF_SSH_KNOWN_HOSTS`, `APP_URL`, and `NOTIFICATIONS_ENABLED=false`.
The production environment has one secret: `PCF_DEPLOY_SSH_KEY`.

That SSH key is restricted by its VPS authorized-key entry to
`/opt/pcf/ci/deploy.py`. It cannot open a shell, transfer arbitrary files, allocate
a terminal, or forward ports. Its only accepted command is
`deploy <40-character-commit> <migration-fingerprint>`, with an image archive on
standard input. The server-side gate is installed separately with administrator
access; an application deployment cannot replace the gate or proxy config.

Supabase's server key and other runtime secrets remain in the VPS file
`/opt/pcf/.env.runtime` (mode 600), outside Git and the Docker image. Do not copy
`.secrets/`, `.env.local`, or database backups into the repository.
Notification email and the daily digest remain disabled.

## Database changes

App deployments do not automatically migrate or reset the financial database.
The server compares the release's migration fingerprint against
`/opt/pcf/schema.sha256`. Changes to SQL migration files block deployment before
an image is accepted. Routine app changes require no database step.

For a database change, add a forward migration, test it, and apply it to the
confirmed PCF Supabase project `zrnutmybqvmbzxvcdqza` using an authenticated
Supabase session. Verify the remote migration history matches all files in the
release. Only then run `python3 scripts/migration-fingerprint.py` from that exact
checkout and install the resulting value in `/opt/pcf/schema.sha256` using
administrator SSH. Re-run the workflow on `main`. Never edit an applied migration
or advance this fingerprint before applying and verifying the schema.
Database changes must remain compatible with the previous app release while
rolling out; app rollback does not reverse financial database migrations.

## Operations and rollback

On the VPS, inspect `/opt/pcf/release.json` for the deployed commit and previous
image ID. Check service health using:

```sh
cd /opt/pcf
docker compose -f compose.yml -f compose.proxy.yml ps
curl --fail https://pcf.dryveph.io/api/health
```

To roll back manually, set only `PCF_IMAGE` in `/opt/pcf/.env` to the recorded
previous image ID, then run:

```sh
docker compose -f compose.yml -f compose.proxy.yml up -d --no-deps app
```

Check PCF and both existing sites afterward. Keep previous PCF images available;
do not prune or stop other projects. Future changes to deployment scripts,
Compose limits, proxy configuration, or the existing sites' response baseline
need a reviewed administrator update to the installed files on the VPS.
Re-run `/opt/pcf/reconnect-proxy.sh` if the shared Caddy container is recreated.
See [Hostinger details](../deploy/hostinger/README.md).
