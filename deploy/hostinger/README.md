# Hostinger PCF deployment

Target: `pcf.dryveph.io`, VPS `srv2113801.hstgr.cloud` (KVM2, Linux amd64).
PCF files live in `/opt/pcf`. Private runtime configuration has mode 600.
Initial image: `pcf/app:20261106-01`. Email notifications remain disabled.

Use both compose files for all PCF operations:

```sh
cd /opt/pcf
docker compose -f compose.yml -f compose.proxy.yml ps
```

The app has a 512 MiB memory limit, 0.5 CPU limit, private cache volume,
read-only root filesystem, and a loopback-only health port at 3107.
It uses its own `pcf_default` network. Only the existing Caddy container is
attached to that network; other projects are not attached.

`Caddyfile.fragment` adds one PCF hostname to the existing
`/opt/inventory-flow/deploy/Caddyfile`. The original is backed up in
`/opt/pcf/Caddyfile.before-pcf`. Validate Caddy configuration before gracefully
reloading it. Do not replace the shared configuration with this fragment.

Run `/opt/pcf/reconnect-proxy.sh` after recreating the Caddy container.
Container restarts retain network membership; container recreation does not.
If the inventory-flow deployment starts managing Caddy's networks itself,
preserve this attachment in that project's deployment configuration.

For an app update, load a new Linux amd64 image, change only PCF_IMAGE in
`/opt/pcf/.env`, then run:

```sh
docker compose -f compose.yml -f compose.proxy.yml up -d --no-deps app
```

Check `/api/health`, password login, and both existing sites after a change.
Keep previous immutable images to allow rolling back only PCF. No automatic
schema rollback is performed. Never run a Docker-wide prune or stop command.

Supabase stores the application data and private attachments. Offsite database
and storage backup automation remains a follow-up before production financial
use. The live deployment is initially for administrator testing.

## Native build fallback

The first release uses a native build because Docker Desktop's amd64 emulator
crashed during Next page-data collection. Only the selected source files were
uploaded, without `.env` files or `.secrets`. The temporary builder is capped
at one CPU and 3 GiB RAM and uses public Supabase build variables only.
`Dockerfile.runtime` packages its standalone output. Subsequent builds should
use a native amd64 CI runner where possible to avoid load on the shared VPS.

## Automatic releases

GitHub Actions now builds application releases on native amd64 runners and uses
an SSH key restricted to `/opt/pcf/ci/deploy.py`. Only `main` can deploy.
See [CI/CD instructions](../../docs/CI_CD.md) for the installed gate, migration
fingerprint, automatic rollback, and configuration. The original unrestricted
administrator key is not shared with GitHub.
