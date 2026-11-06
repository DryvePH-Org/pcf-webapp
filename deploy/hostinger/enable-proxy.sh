#!/bin/sh
set -eu
cd /opt/pcf
curl --fail --silent http://127.0.0.1:3107/api/health
./reconnect-proxy.sh
config=/opt/inventory-flow/deploy/Caddyfile
if grep -q '^# BEGIN pcf$' "$config"; then
  echo 'PCF proxy block already exists; inspect before updating' >&2
  exit 1
fi
# Stop if another deployment changed the proxy since our backup.
cmp -s "$config" Caddyfile.before-pcf
cat Caddyfile.fragment >> "$config"
if ! docker exec inventory-flow-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cat Caddyfile.before-pcf > "$config"
  exit 1
fi
if ! docker exec inventory-flow-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cat Caddyfile.before-pcf > "$config"
  docker exec inventory-flow-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  exit 1
fi
