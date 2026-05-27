#!/bin/sh
set -e

echo "============================================"
echo "  TaintedPort - Starting fresh instance"
echo "============================================"

# Always reset the database on container start
# This ensures a clean state for security testing
echo "[init] Resetting database..."
cd /var/www/backend
rm -f database.db
php setup_db.php

# Ensure correct permissions
mkdir -p /var/www/backend/data
chown -R www-data:www-data /var/www/backend/database.db /var/www/backend/data

echo "[init] Database ready."

# Background sanity check: php-fpm must create its unix socket within 15s
# after supervisord starts the children. If it doesn't, FPM is almost
# certainly listening on TCP (upstream image config drift) and nginx will
# 502 every request. Loud failure here beats silent degradation.
(
    i=0
    while [ $i -lt 30 ]; do
        if [ -S /var/run/php-fpm.sock ]; then
            echo "[init] php-fpm socket present at /var/run/php-fpm.sock"
            exit 0
        fi
        i=$((i + 1))
        sleep 0.5
    done
    echo "[init] FATAL: /var/run/php-fpm.sock never appeared after 15s." >&2
    echo "[init] FATAL: php-fpm is probably listening on TCP — check /usr/local/etc/php-fpm.d/www.conf" >&2
) &

echo "[init] Starting services..."

exec "$@"
