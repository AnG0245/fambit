#!/bin/sh
set -eu
# The persistent disk can be mounted with root ownership. Drop privileges before
# starting Node. This directory contains only this service's private data.
case "${NUBE_DATA_DIR:-}" in
  /var/data/fambit) ;;
  *) echo 'El contenedor requiere NUBE_DATA_DIR=/var/data/fambit.' >&2; exit 1 ;;
esac
mkdir -p "$NUBE_DATA_DIR"
chmod 700 "$NUBE_DATA_DIR"
mkdir -p /var/data/backups
chmod 700 /var/data/backups
if [ "$(id -u)" = 0 ]; then
  chown -R node:node "$NUBE_DATA_DIR"
  chown -R node:node /var/data/backups
  exec gosu node "$@"
fi
exec "$@"
