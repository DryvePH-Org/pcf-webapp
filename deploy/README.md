# PCF deployment

PCF is deployed for administrator testing at https://pcf.dryveph.io on the shared
Hostinger KVM2 VPS. See [Hostinger deployment notes](hostinger/README.md) for the
current service paths, limits, proxy integration, and update instructions.
The initial native Linux build passed. Existing projects were left running.
Do not replace an existing proxy configuration or restart unrelated projects.

## Before the first deployment

Obtain the confirmed SSH host/user/port, domain, and DNS access. Inspect the VPS:
OS and architecture, free memory/disk/CPU, listening ports, existing containers
and process managers, reverse proxy/TLS setup, and health of both existing sites.
Use a read-only inspection first. Reserve an unused loopback port for PCF and
choose resource limits from actual spare capacity, not the example defaults.

Build a Linux image matching the inspected CPU architecture, preferably away from
the shared VPS. The Docker build receives only the public Supabase URL/key and
timezone as build arguments. Never pass the server secret as a build argument.
The image uses Next's standalone output, runs as UID 10001, and excludes private
environment files and `.secrets/` from its build context.

## Private runtime configuration

Copy `.env.runtime.example` to `.env.runtime` outside source control and set the
real keys and HTTPS origin. Protect it with mode 600. Copy `.env.example` to
`.env` and set a unique immutable `PCF_IMAGE` release tag and the inspected port
and limits. Keep `NOTIFICATIONS_ENABLED=false` as requested. Password sign-in
works without notification email delivery.

`compose.yml` publishes only on 127.0.0.1, creates its own Compose project/network
and cache volume, drops capabilities, disallows new privileges, uses a read-only
root filesystem, and limits CPU/memory/PIDs/log size. Do not use `host` networking
or privileged mode. Validate with `docker compose config --quiet` before starting.

Integrate one PCF virtual host into the proxy already running on the VPS. Preserve
all existing virtual hosts. Set TLS and forward Host, X-Forwarded-Proto, and a
proxy-overwritten X-Forwarded-For; clear CF-Connecting-IP unless traffic actually
comes through Cloudflare. Do not expose the Node port publicly. Validate the
proxy configuration before any graceful reload.

## Launch and short smoke test

Start only the PCF Compose project after loading its verified image. Check the
loopback health endpoint before adding the public virtual host. Confirm HTTPS,
password sign-in, role access, private receipt restrictions, and mobile layout.
Do not seed the real project. Start with the existing administrator; real staff,
funds, categories, and assignments can be configured through the app.

Verify both existing projects still respond after PCF starts and after proxy
changes. The daily email workflow must stay disabled. Configure the final APP_URL
in the app and Supabase URL settings when the domain is known.

## Backups and rollback

Before production financial use, configure database backups and separate exports
of both private buckets (`receipts` and `liquidation-receipts`) to storage outside
the VPS. A database dump alone does not contain attachment bytes. Protect backup
credentials and files, and perform a restore check. A scheduled pg_dump job needs
the Supabase database connection credentials; those are not configured here.

Keep the prior PCF image tag and private environment file before each update.
To roll back the app, point only PCF at that prior image and recreate only its
app service. Do not roll back or reset the shared Supabase database automatically;
use forward corrective migrations. Do not run Docker-wide prune/down commands,
change another project's ports, or replace the global reverse proxy config.

### Liquidation reminders

Budget requests are blocked while the account has a released advance whose
liquidation is unfiled, draft, or flagged. Submission lifts this restriction.
The deadline is 48 hours after cash release.

Enable Supabase's `pg_cron` extension before applying phase 35. The migration
schedules `pcf-liquidation-reminders` hourly. The job inserts at most one overdue
in-app reminder per voucher per Manila calendar day. Check `cron.job_run_details`
to verify execution. For a project where Cron was enabled after migration, run
`select cron.schedule('pcf-liquidation-reminders','0 * * * *','select public.generate_liquidation_reminders();');`.
