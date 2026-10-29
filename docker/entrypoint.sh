#!/bin/sh
set -e

echo "============================================"
echo "  TaintedPort - Starting fresh instance"
echo "  Version: ${APP_VERSION:-unknown}"
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

# Seed the htpasswd file used by nginx to gate /a/*.
# Set ADMIN_USER / ADMIN_PASS at runtime to override; the defaults are
# only suitable for local development.
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-taintedport}"
htpasswd -bcB /etc/nginx/.htpasswd "$ADMIN_USER" "$ADMIN_PASS" >/dev/null 2>&1
chown nginx:nginx /etc/nginx/.htpasswd
chmod 0440 /etc/nginx/.htpasswd
echo "[init] htpasswd seeded for user '$ADMIN_USER'"

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

# Provision any runtime secret the operator didn't supply, so a bare
# `docker run` still has fully-working features. Operator-supplied values
# (docker run -e ... / --env-file) always win; the app still fails closed on a
# genuinely-empty value, this only fills the gap for a plain build.
provision_secret() {   # $1 = env var name, $2 = length in hex chars
    eval "cur=\$$1"
    if [ -z "$cur" ]; then
        val=$(LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c "$2")
        export "$1=$val"
        echo "[init] provisioned $1"
    fi
}
provision_secret JWT_SIGNING_SECRET 48
provision_secret GIFTCARD_AES_KEY 16
provision_secret TRACKING_LINK_SECRET 14
provision_secret REMEMBER_TOKEN_KEY 64
provision_secret VOUCHER_SIGNING_KEY 16

echo "[init] Starting services..."

exec "$@"
