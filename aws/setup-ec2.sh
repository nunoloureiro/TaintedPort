#!/bin/bash
set -euo pipefail

# ============================================================
# TaintedPort - EC2 Setup Script
# Run this on a fresh Amazon Linux 2023 / Ubuntu EC2 instance.
# Works on t2.nano, t3.micro, t4g.nano, etc.
# ============================================================

echo "============================================"
echo "  TaintedPort - EC2 Setup"
echo "============================================"

# --- Install Docker ---
if ! command -v docker &> /dev/null; then
    echo "[1/4] Installing Docker..."
    if [ -f /etc/os-release ] && grep -q "amzn" /etc/os-release; then
        # Amazon Linux
        sudo yum update -y
        sudo yum install -y docker
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker ec2-user
    else
        # Ubuntu/Debian
        sudo apt-get update
        sudo apt-get install -y docker.io
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker ubuntu
    fi
else
    echo "[1/4] Docker already installed."
fi

# --- Pull or build the image ---
echo "[2/4] Setting up TaintedPort container..."

# Option A: Pull from a registry (uncomment and set your image)
# docker pull yourusername/taintedport:latest

# Option B: Build locally (if you copied the source)
if [ -f Dockerfile ]; then
    echo "  Building from source..."
    sudo docker build -t taintedport:latest .
else
    echo "  ERROR: No Dockerfile found and no image to pull."
    echo "  Either:"
    echo "    - Run this script from the project root (with Dockerfile)"
    echo "    - Or uncomment the 'docker pull' line above"
    exit 1
fi

# --- Start the container ---
echo "[3/4] Starting TaintedPort..."
sudo docker stop taintedport 2>/dev/null || true
sudo docker rm taintedport 2>/dev/null || true
sudo docker run -d \
    --name taintedport \
    --restart unless-stopped \
    -p 127.0.0.1:8080:80 \
    taintedport:latest

# --- Set up weekly reset cron job (Monday 00:00 UTC) ---
echo "[4/4] Setting up weekly reset (Monday 00:00 UTC)..."
CRON_CMD="0 0 * * 1 docker restart taintedport >> /var/log/taintedport-reset.log 2>&1"
(sudo crontab -l 2>/dev/null | grep -v "taintedport"; echo "$CRON_CMD") | sudo crontab -

# --- Install nginx host config ---
echo "[5] Installing nginx virtual host config..."
sudo cp docker/nginx-host-taintedport.conf /etc/nginx/sites-available/taintedport.com
sudo ln -sf /etc/nginx/sites-available/taintedport.com /etc/nginx/sites-enabled/taintedport.com
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "============================================"
echo "  TaintedPort is running!"
echo "  Container: 127.0.0.1:8080"
echo "  Host nginx: taintedport.com + api.taintedport.com -> container"
echo "  Weekly reset: Monday 00:00 UTC"
echo "============================================"
echo ""
echo "Useful commands:"
echo "  docker logs taintedport        # View logs"
echo "  docker restart taintedport     # Manual reset (fresh DB)"
echo "  docker stop taintedport        # Stop"
echo "  docker start taintedport       # Start again"
