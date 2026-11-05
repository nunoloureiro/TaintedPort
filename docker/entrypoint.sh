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

# The partner-integration API signs RS256 tokens with an RSA private key.
# Unlike the random secrets above it has to stay paired with the public
# verification key, so a fixed default (base64-encoded PEM) is provisioned
# when the operator didn't supply one.
if [ -z "$PARTNER_JWT_PRIVATE_KEY" ]; then
    export PARTNER_JWT_PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRRFFmRUNKMEJROWgrNEYKc3EvYmdJZGNkdEsranBrdlgvQ0k0Z1p1OWVvVjEyT1JKa3c0YWtiUWJpbHNXcFNRT3BZYnd0MGhYcUgwbTZRMQpFUHZkYU85NXd4TS95eXhWamE1blZHZzM1N1N3ZEoxVmRZd1Bsb3g2QmgzY3JPdEkvWjErY1g3NEVNL1ZnbWorCkNNUUpDMWkwN1Ayb29GSGhiYm5nQUQrNFpqOXR5UWpnMlpHcFV2cHFTdVNSbEZGSFRIZ0NVU2hlcy9OdmpVZ20KZXFqclZlY0UzUE11dlJuN28zcndsd0dYbHRncHlPZGlqd0xTblBKOG41WkJlZmlreGZWaWpvd0pJd3lXTHh1dApVOU9Uc2o0ZE1LS2tIb0ZiYU5zT0RlM0VYQlRhN0prRmloaFIzT2JoaHVGcmdVYWNtdklRSGhpTkZXS0cwQWF1Cit5RG5mcUIxQWdNQkFBRUNnZ0VBQUw2N2VVK3lXUUNVdmJMNHpDUCtiRFRmcnB3bXRpRFZudFhLVDJuaW5BVTgKYXIySXJ1RUZFNkVFYlRLTENOOHYvOUtnSjdrMjMvOTV3WXY1WUtFUmZHSGpCQ2ZISnRtU2hOTGdqbUNXMmZkbQpMS0ZsTkU4bHcxTGZPZ25kaGFrai81cUZSbU54aVpyY3VabXVYNm45MUlEMjhrZWVaQVNZWTVGNUJlblYvaVd3CmFYUjNHQnYrRTRBbjQrcVd1SlU5eW5XYXNwYXdkYnZSMnV5by9YVDVkbjNyRVQ3TGhPdE5MQ2ZqVmxQTk90OWMKWUNWUnptUDBvRXlmWkJ0MzlvMHJYalN2NWtVMVhDWURPQjNzZ1R1Y21LL0MwM25xSm84M09LTFlIQUV3b3FoYgp3UE1ZN2d2dHpLaGJBSlNxMWE2d3FlSVFhOU96STFOVVVidWpLNXJUQ1FLQmdRRDNuMEtML282MjZHYmx3aVhjCkpwU3RhVXU3YUZaVWdTekJxWHQrS1I2bUVRWGQ0TFAxZ3MveEdFMGVPcjh4dFhOcitQWTFEZGZCdHBXMzhkSXIKKzZWUHFHWmdzdFgvSFVweElaVmlJakdhdmZjZVFrcmxUS0xVZjFWcCsvcU1IYXMrNlpuYlVlZlNxSnY2VjJLbQo3TkhGNy9HVnpGZDdBS0dpZEVzMVJ4dUpTUUtCZ1FEWGlnUHRROU1qNUFNM21HMjhhVkxMMkErMmJ3eU9tRGRqCmhFSkNtb0hFMmk4UFEyZVR1dTNTSWczSEFYZzN5bEF4V2E3cWpnMzhNN0dlZzJHcXpiTWJOL2tBdXJoSFZscEsKUTc1Y0d6OHcvckczR1dXRTFXamlFN3JCYUdrdWV0VnZQSGlCZ2JCdklBZTRCYi9SajNhM0ZvOHpHbkI4QVB6UwphVW4vcnMwcHpRS0JnR01sMko1M1dhdHhHS3BNZDU1VHNGcFMrK2paR1NBUzdObktROUU3STdONHczR1k1RldjCmdDaFlBNkRrQXVRamRFaTZVZExpYlE1NlRpNXQzQ3FTUXhuSEl0NzdIR1plMHd6RFZxNEpaUFZCdE8zZnUxOWUKdFNBQ3NDK1VuamgyTkxnbkR0emJTY2gyaktYTFVZdm03UU9sVklVWFlidTFnQUt0TCtQd1NkMUpBb0dBTy96dAptdHVGcURlTnJhdCszekZ4R2NySWxMM1RnTnhjamhZQld3Z2xsZVFqdE52TnVCQU9vSzFacUVtQWJBYWl5eGxxCjFWMDBCejFiOGdJZTdLclRibi9salk1cU8zQ05NSjRxSFBoNFhlcUZDN0RGMEhLVS9sYi9ZMVRyOFVPK28zYngKRXhwRlFLaHBmWTRjRlBjWTAxd3ovc1VkQ1dZODkxTFdoWkxoQndFQ2dZRUF2S0VJamlXTGhMM2UyemlUU04zKwpTVUdqallTOUxjOUFQRGtDOW1uSnQyYnhJYWd6TThnSDhoY3JONjZXYVBCTU12VEYvOUY4MXJyRUxMLzRFR2hYCk1UbFVRR3lUKzk1V01DYUp1V1ZQNURmd1VmdklVSkFudE9IVnJMT2NqZTQ2d2ZpTzRRR1pUa2g4M0NlS0ZDRGYKeDU1czA5a3hlZzFsdFdjZzVUVDlCR1U9Ci0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K"
    echo "[init] provisioned PARTNER_JWT_PRIVATE_KEY"
fi

echo "[init] Starting services..."

exec "$@"
