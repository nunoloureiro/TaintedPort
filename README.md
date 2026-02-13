# TaintedPort - Portuguese Wine Store (Security Test App)

A deliberately vulnerable Portuguese wine e-commerce application built with Next.js and PHP, designed for DAST and security testing. Packaged as a single Docker container for easy deployment.

> **WARNING:** This is NOT a real store. It is an intentionally vulnerable application for security testing purposes only. Wine names, prices, and descriptions are fictional.

## Hostnames

| Service | Hostname | Description |
|---------|----------|-------------|
| Frontend | `taintedport.com` | Next.js web application |
| API | `api.taintedport.com` | PHP REST API |

Both are served from a single container via nginx virtual hosts.

## Quick Start (Docker - Local)

The fastest way to run TaintedPort locally:

```bash
docker run -p 8080:80 taintedport:latest
```

Then open `http://localhost:8080`. Locally, the API is accessible at `http://localhost:8080/api/` (path-based routing).

The database resets automatically every time the container starts, giving you a clean environment.

### Build from source

```bash
git clone <repo-url>
cd Vulnpoc

# Local build (uses /api path-based routing)
docker compose build
docker compose up -d

# OR production build (uses api.taintedport.com)
docker build -t taintedport:latest .
```

### Docker Compose (local development)

```bash
docker compose up -d
```

App available at `http://localhost:8080`. The `docker-compose.yml` builds with `API_URL=/api` so the frontend calls the API via path-based routing (no separate hostname needed locally).

## Demo Account

- **Email**: joe@example.com
- **Password**: password123

## Local Development (without Docker)

### 1. Set up the Database

```bash
cd backend
php setup_db.php
```

### 2. Start the Backend

```bash
cd backend
php -S localhost:8000 router.php
```

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

App at `http://localhost:3000`, API at `http://localhost:8000/api/`.

## AWS Deployment (EC2)

Run TaintedPort on a cheap EC2 instance (~$5-10/month with a t2.nano or t3.micro).

### DNS Setup

Point both domains to your EC2 instance's public IP:

| Record | Type | Value |
|--------|------|-------|
| `taintedport.com` | A | `<EC2_PUBLIC_IP>` |
| `api.taintedport.com` | A | `<EC2_PUBLIC_IP>` |

### Deploy to EC2

1. Launch an EC2 instance (Amazon Linux 2023 or Ubuntu, t2.nano is fine)
2. Open ports 80 and 443 in the security group
3. SSH in and run:

```bash
# Copy the project to the instance (or git clone)
scp -r . ec2-user@YOUR_IP:~/taintedport/

# SSH in
ssh ec2-user@YOUR_IP

# Run the setup script
cd ~/taintedport
./aws/setup-ec2.sh
```

That's it. The script installs Docker, builds the image, starts the container on port 80, and sets up a **cron job to restart it every Monday at 00:00 UTC** (which resets the database to a clean state).

### Useful commands on the instance

```bash
docker logs taintedport          # View logs
docker restart taintedport       # Manual reset (fresh DB)
docker stop taintedport          # Stop
docker start taintedport         # Start
```

### Weekly Reset

A cron job runs `docker restart taintedport` every Monday at 00:00 UTC. Since the container entrypoint always resets the SQLite database on start, this gives a fresh environment each week.

## Distribute the Container

### Push to Docker Hub (for sharing)

```bash
docker build -t taintedport:latest .
docker tag taintedport:latest yourusername/taintedport:latest
docker push yourusername/taintedport:latest
```

Others can then run:

```bash
docker run -p 8080:80 nunoloureiro/taintedport:latest
```

## Tech Stack

- **Frontend**: Next.js 14 (standalone) + Tailwind CSS 3
- **Backend**: PHP 8 (PHP-FPM) + SQLite3
- **Proxy**: nginx (virtual hosts: `taintedport.com` + `api.taintedport.com`)
- **Process Manager**: supervisord (nginx + PHP-FPM + Node.js)
- **Authentication**: JWT (HS256) + TOTP 2FA
- **Container**: Single Docker image (~200MB)

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current user (requires auth) |
| PUT | `/api/auth/profile` | Update name (requires auth) |
| PUT | `/api/auth/email` | Change email (requires auth + password) |
| PUT | `/api/auth/password` | Change password (requires auth + current password) |
| POST | `/api/auth/2fa/setup` | Generate TOTP secret + QR URI (requires auth) |
| POST | `/api/auth/2fa/enable` | Enable 2FA with secret + code (requires auth) |
| POST | `/api/auth/2fa/disable` | Disable 2FA (requires auth + password) |

### Wines
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wines` | List wines (with search, filter, sort) |
| GET | `/api/wines/:id` | Get wine details |
| GET | `/api/wines/regions` | List available regions |
| GET | `/api/wines/types` | List available types |

### Cart (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cart` | Get cart items |
| POST | `/api/cart/add` | Add item to cart |
| PUT | `/api/cart/update` | Update item quantity |
| DELETE | `/api/cart/remove/:wine_id` | Remove item from cart |

### Orders (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place an order |
| GET | `/api/orders` | List user's orders |
| GET | `/api/orders/:id` | Get order details |

## Features

- JWT-based authentication with 7-day token expiry
- TOTP-based two-factor authentication (2FA) with QR code scanning
- Editable user profile (name, email, password)
- Responsive dark-themed UI inspired by Snyk Labs
- Wine catalog with search, filter by region/type, sort, and price range
- Shopping cart with quantity management
- Checkout with shipping address and payment on delivery
- User account with order history and security settings
- 24 seeded Portuguese wines from 7+ regions
- About page with disclaimers
- Global footer on every page
- Auto-reset database on container start

## Project Structure

```
Dockerfile              # Multi-stage build (Node + PHP + nginx)
docker-compose.yml      # Local container orchestration
docker/
  nginx.conf            # Reverse proxy config
  supervisord.conf      # Process manager config
  entrypoint.sh         # DB reset + service startup
aws/
  setup-ec2.sh          # EC2 setup script (Docker + cron)

backend/
  api/
    config/             # Database, JWT, TOTP configuration
    controllers/        # Request handlers
    middleware/          # Auth middleware
    models/             # Data models
    index.php           # API entry point
  router.php            # PHP dev server router
  setup_db.php          # Database setup & seed script

frontend/
  app/                  # Next.js pages (App Router)
  components/           # Logo, Navbar, Footer, WineBottle, etc.
  context/              # Auth and Cart context providers
  lib/                  # API client
```
