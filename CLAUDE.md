# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

A Portuguese wine e-commerce demo: Next.js 14 frontend + vanilla PHP backend (SQLite) + nginx + supervisord in one Docker image. Used as a deliberately weak target for security testing — do not adopt the patterns here for production code.

## Build & run

```bash
# Local container (both repos checked out side-by-side)
docker buildx build --build-context vulns=../TaintedPort-Vulns -t taintedport .
docker run -d --name taintedport -p 8080:80 taintedport
```

Or with Compose (uses `API_URL=/api`):

```bash
docker compose up -d
```

Without the `vulns` build context the image will not build — see `DeployInstructions.txt`.

### Backend + frontend without Docker

```bash
cd backend && php setup_db.php && php -S localhost:8000 router.php
cd frontend && npm install && npm run dev
```
Frontend at `http://localhost:3000`, API at `http://localhost:8000/api/`.

### Lint

```bash
cd frontend && npm run lint
```

### Functional tests

```bash
cd tests && pip install -r requirements.txt
pytest                       # all (api/ only)
pytest api/test_auth.py      # single file
```

Tests default to `http://localhost:8000`. Override with `TAINTEDPORT_API_URL`. The session auto-resets the SQLite DB via `php setup_db.php`.

## Architecture

Single Docker container running three services via supervisord:
- **nginx** — reverse proxy: `taintedport.com` → Next.js, `api.taintedport.com` → PHP-FPM. Local Docker uses path-based `/api` routing on a single hostname.
- **Node.js** (port 3000) — Next.js 14 standalone build (App Router)
- **PHP-FPM** (unix socket `/var/run/php-fpm.sock`) — vanilla PHP REST API

### Frontend (`frontend/`)
- Next.js 14, Tailwind CSS 3, Axios
- React Context: `AuthContext` (JWT in localStorage), `CartContext`
- API client in `lib/api.js`
- Build arg `API_URL` controls API endpoint

### Backend (`backend/`)
- `api/index.php` — router (switch/case)
- `api/controllers/`, `api/models/` — handlers and SQLite data layer
- `api/config/` — database singleton, JWT (HS256), TOTP
- `api/middleware/auth.php` — JWT auth
- `setup_db.php` — schema + 24 seeded wines + 3 demo users

### Docker (`docker/`)
- `entrypoint.sh` — resets DB on start; fails fast if `/var/run/php-fpm.sock` doesn't appear within 15s
- `nginx.conf` — vhost (prod) + path-based (local Docker)
- `supervisord.conf`
- `php-fpm-pool.conf` — full custom www.conf (do not sed the upstream)

## Demo accounts

| Email | Password | Role |
|-------|----------|------|
| joe@example.com | password123 | User |
| jane@example.com | password123 | User |
| admin@example.com | password123 | Admin |

## Key details

- Database is SQLite3 at `backend/database.db`, auto-reset on container start.
- OpenAPI spec at `openapi.yaml`.
- Version tracked in `VERSION`.
- No PHP dependency manager — vanilla PHP, no Composer.
