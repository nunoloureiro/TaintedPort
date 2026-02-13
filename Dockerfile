# ============================================================
# TaintedPort - Multi-stage Dockerfile
# Bundles Next.js frontend + PHP backend + nginx in one image
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

# Install nginx, supervisor, sqlite
RUN apk add --no-cache \
    nginx \
    supervisor \
    nodejs \
    sqlite

# Install PHP SQLite extension (already included in php:8.2-fpm-alpine, but ensure)
RUN docker-php-ext-install pdo pdo_sqlite

# ---------- PHP backend ----------
COPY backend/ /var/www/backend/

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
# Listen on a socket instead of TCP for performance
RUN sed -i 's|listen = 9000|listen = /var/run/php-fpm.sock|' /usr/local/etc/php-fpm.d/zz-docker.conf && \
    echo "listen.owner = nginx" >> /usr/local/etc/php-fpm.d/zz-docker.conf && \
    echo "listen.group = nginx" >> /usr/local/etc/php-fpm.d/zz-docker.conf && \
    echo "listen.mode = 0660" >> /usr/local/etc/php-fpm.d/zz-docker.conf

# Create required directories
RUN mkdir -p /var/run/nginx /var/log/supervisor /var/tmp/nginx

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
