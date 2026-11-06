#!/bin/sh
set -eu
# Caddy is the only existing container connected to the private PCF network.
# Re-run after recreating the Caddy container; ordinary restarts retain networks.
if ! docker network inspect pcf_default --format '{{range .Containers}}{{println .Name}}{{end}}' | grep -qx inventory-flow-caddy-1; then
  docker network connect pcf_default inventory-flow-caddy-1
fi
