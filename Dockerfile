# syntax=docker/dockerfile:1.4
# ============================================================
# TaintedPort - Multi-stage Dockerfile
# Bundles Next.js frontend + PHP backend + nginx in one image
#
# A plain "docker build ." works out of the box and uses the stub
# in vulns-stub/ for the bundled data file. The maintainer replaces
# it at build time by passing a different vulns context:
#
#     docker buildx build --build-context vulns=<path> ...
# ============================================================

# --- Vulns content source (default: the in-repo stub) ----------
FROM scratch AS vulns
COPY vulns-stub/ /

# --- Stage 1: Build the Next.js frontend ---
FROM node:18-alpine AS frontend-build

WORKDIR /app

# Build arg: set API URL at build time
# Production: https://api.taintedport.com
# Local Docker: /api (nginx proxies to PHP-FPM)
ARG API_URL=https://api.taintedport.com

# App version: "<major>.<commit count>", computed by build.sh from the
# VERSION file and git history (not available inside the build context).
ARG APP_VERSION=dev

COPY frontend/package.json frontend/package-lock.json ./
# A TLS-intercepting egress proxy re-signs the npm registry certificate with a
# private root the container doesn't trust, so npm ci can't verify the chain and
# fails the fetch — sometimes still exiting 0 with an incomplete install (no
# node_modules/.bin/next, which then breaks `next build`). Pass that root as an
# optional build secret (id=corp_ca) so Node trusts it for this step only. Absent
# (plain builds / direct internet) it's a no-op, and the cert is never written
# into an image layer or this repo. build.sh wires the secret in automatically.
RUN --mount=type=secret,id=corp_ca \
    if [ -s /run/secrets/corp_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/corp_ca; fi; \
    npm ci

COPY frontend/ ./

ENV NEXT_PUBLIC_API_URL=${API_URL}
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
RUN npm run build

# --- Stage 2: Consul binary (not packaged in Alpine 3.19+) ---
FROM hashicorp/consul:1.22.7@sha256:a230dcea0bb107bd7958a912d1429fb7f9d399637de7ffb814b34412b9e8c543 AS consul

# --- Stage 3: Final runtime image ---
FROM php:8.2.35-fpm-alpine3.24

# Re-declared here (see stage 1) so entrypoint.sh can log the running
# version at container start — the only way to confirm a redeploy actually
# picked up a new image without loading the site.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Install nginx, supervisor, sqlite and dev libs for PHP extensions.
# Alpine's package mirrors are HTTPS, so the same TLS-intercepting proxy that
# breaks npm in stage 1 breaks apk too: apk update reports the index as
# "untrusted" (and still exits 0), then apk add finds no packages. If the
# corp_ca secret is supplied, trust it for this step only, restoring the stock
# CA bundle afterwards so the private root is never baked into the published
# image. A no-op when the secret is absent.
RUN --mount=type=secret,id=corp_ca \
    if [ -s /run/secrets/corp_ca ]; then \
        cp /etc/ssl/certs/ca-certificates.crt /tmp/ca-certificates.crt.orig; \
        cat /run/secrets/corp_ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi; \
    apk update && apk add --no-cache \
        nginx \
        apache2-utils \
        supervisor \
        nodejs \
        sqlite \
        sqlite-dev; \
    apk_status=$?; \
    if [ -f /tmp/ca-certificates.crt.orig ]; then \
        mv /tmp/ca-certificates.crt.orig /etc/ssl/certs/ca-certificates.crt; \
    fi; \
    exit $apk_status

# Local config/service-discovery agent
COPY --from=consul /bin/consul /usr/local/bin/consul

# Install PHP SQLite extension. docker-php-ext-install shells out to apk to pull
# its .phpize-deps build toolchain (gcc, make, autoconf, …), so under a
# TLS-intercepting proxy it hits the same untrusted-cert failure as the apk step
# above — trust the corp_ca secret for this step only and restore the stock CA
# bundle afterwards. A no-op when the secret is absent.
RUN --mount=type=secret,id=corp_ca \
    if [ -s /run/secrets/corp_ca ]; then \
        cp /etc/ssl/certs/ca-certificates.crt /tmp/ca-certificates.crt.orig; \
        cat /run/secrets/corp_ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi; \
    docker-php-ext-install pdo pdo_sqlite; \
    ext_status=$?; \
    if [ -f /tmp/ca-certificates.crt.orig ]; then \
        mv /tmp/ca-certificates.crt.orig /etc/ssl/certs/ca-certificates.crt; \
    fi; \
    exit $ext_status

# ---------- PHP backend ----------
# NOTE: no secrets are baked into this (public) image. Supply them at run time
# (docker run -e ... or --env-file); php-fpm forwards them to workers via env[],
# and open_basedir restricts PHP's own file access so they stay out of reach of
# anything running inside the app. Runtime variables:
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET  - card payments (optional; without
#                                               them checkout falls back to
#                                               payment-on-delivery)
#   JWT_SIGNING_SECRET    (>= 32 bytes)        - session token signing
#   GIFTCARD_AES_KEY      (exactly 16 bytes)   - gift-card token encryption
#   TRACKING_LINK_SECRET  (exactly 14 bytes)   - order-tracking link signing
# The three below are required; their features return a server error if unset.
COPY backend/ /var/www/backend/
COPY openapi.yaml /var/www/backend/openapi.yaml

# Read-only reference copy of the backend, paired with docker/heal.php (wired in
# as php-fpm's auto_prepend_file) which restores any code file that diverges
# from this copy after a fatal error. Runtime state (database, data/, uploads/)
# is left alone. Built before the www-data chown below so this copy stays
# root-owned and unwritable by the app user.
RUN cp -a /var/www/backend /var/www/backend-pristine \
 && chown -R root:root /var/www/backend-pristine \
 && chmod -R a-w /var/www/backend-pristine
COPY docker/heal.php /var/www/heal.php
RUN chown root:root /var/www/heal.php && chmod 0444 /var/www/heal.php

# Kept outside /var/www/backend: nginx exposes that whole directory at /files/,
# and this map must not be visible to the crawlers being measured.
COPY crawler-coverage/ /var/www/crawler-coverage/

# Owned by nginx (not www-data/php-fpm), and locked down to that owner only.
# nginx gates this file behind basic auth at /a/vulns/data (see
# docker/nginx.conf); keeping it unreadable by the php-fpm/www-data user is
# defense in depth on top of that gate, so the app process itself can never
# read this file directly regardless of what any given request does.
RUN mkdir -p /var/www/private && chown nginx:nginx /var/www/private && chmod 750 /var/www/private
COPY --from=vulns --chown=nginx:nginx --chmod=440 KnownVulnerabilities.txt /var/www/private/KnownVulnerabilities.txt

# Ensure the database directory is writable
RUN mkdir -p /var/www/backend && chown -R www-data:www-data /var/www/backend

# ---------- Next.js frontend (standalone) ----------
COPY --from=frontend-build /app/.next/standalone /var/www/frontend/
COPY --from=frontend-build /app/.next/static /var/www/frontend/.next/static
COPY --from=frontend-build /app/public /var/www/frontend/public

# ---------- Nginx config ----------
COPY docker/nginx.conf /etc/nginx/nginx.conf

# ---------- Supervisor config ----------
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ---------- Entrypoint ----------
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/consul-seed.sh /usr/local/bin/consul-seed.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/consul-seed.sh

# ---------- PHP-FPM config ----------
# Custom pool: limited workers for t2.small memory constraints, listening
# on a unix socket. We copy a full pool config rather than pattern-patching
# the upstream zz-docker.conf because the upstream php:8.2-fpm-alpine image
# has changed its default contents more than once — a sed silently fails
# when upstream moves and FPM falls back to TCP, breaking nginx with 502s.
COPY docker/php-fpm-pool.conf /usr/local/etc/php-fpm.d/www.conf
RUN rm -f /usr/local/etc/php-fpm.d/zz-docker.conf

# Create required directories
RUN mkdir -p /var/run/nginx /var/log/supervisor /var/tmp/nginx

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
