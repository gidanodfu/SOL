#!/bin/sh
set -eu

mkdir -p writable/cache writable/logs writable/session writable/uploads writable/debugbar
chown -R www-data:www-data writable

exec "$@"
