# syntax=docker/dockerfile:1.4
# ============================================================
# TaintedPort - Multi-stage Dockerfile
# Bundles Next.js frontend + PHP backend + nginx in one image
#
# Two build contexts:
#   - default ("."):  this repo
#   - "vulns":        a sibling directory supplying KnownVulnerabilities.txt
#
# Use ./build.sh (or docker buildx with --build-context vulns=...).
# Without the vulns context the COPY below fails fast, by design.
# ============================================================

# --- Stage 1: Build the Next.js frontend ---
FROM node:18-alpine AS frontend-build

WORKDIR /app

# Build arg: set API URL at build time
# Production: https://api.taintedport.com
# Local Docker: /api (nginx proxies to PHP-FPM)
ARG API_URL=https://api.taintedport.com

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

ENV NEXT_PUBLIC_API_URL=${API_URL}
RUN npm run build

# --- Stage 2: Final runtime image ---
FROM php:8.2-fpm-alpine

# Install nginx, supervisor, sqlite, and dev libs for PHP extensions
RUN apk add --no-cache \
    nginx \
    supervisor \
    nodejs \
    sqlite \
    sqlite-dev

# Install PHP SQLite extension
RUN docker-php-ext-install pdo pdo_sqlite

# ---------- PHP backend ----------
COPY backend/ /var/www/backend/
COPY openapi.yaml /var/www/backend/openapi.yaml

COPY --from=vulns KnownVulnerabilities.txt /var/www/backend/KnownVulnerabilities.txt

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
RUN chmod +x /entrypoint.sh

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
