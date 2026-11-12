#!/bin/sh
# Replaces only the "# BEGIN pcf" ... "# END pcf" block of the shared Caddy
# configuration with /opt/pcf/Caddyfile.fragment, then validates and reloads.
# Any failure restores the configuration that was there before.
set -eu
cd /opt/pcf
config=/opt/inventory-flow/deploy/Caddyfile
caddy() { docker exec inventory-flow-caddy-1 caddy "$@" --config /etc/caddy/Caddyfile --adapter caddyfile; }

grep -q '^# BEGIN pcf$' "$config" || { echo 'No PCF block found; use enable-proxy.sh' >&2; exit 1; }
grep -q '^# END pcf$' "$config" || { echo 'PCF block has no end marker; inspect by hand' >&2; exit 1; }

backup="Caddyfile.before-update-$(date +%Y%m%d%H%M%S)"
cp "$config" "$backup"

awk -v fragment=Caddyfile.fragment '
  /^# BEGIN pcf$/ { while ((getline line < fragment) > 0) print line; skipping = 1; next }
  /^# END pcf$/ { skipping = 0; next }
  !skipping { print }
' "$backup" > "$config"

restore() { cat "$backup" > "$config"; caddy reload || true; echo "Restored $backup" >&2; exit 1; }
caddy validate || restore
caddy reload || restore
curl --fail --silent https://pcf.dryveph.io/api/health >/dev/null || restore
echo "PCF proxy block updated. Previous configuration: /opt/pcf/$backup"
