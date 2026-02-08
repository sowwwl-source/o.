#!/bin/bash
# Production server setup script for DigitalOcean
# Run as root or with sudo

set -e

echo "=== sowwwl Production Setup ==="
echo ""

# Update system
echo "→ Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker
echo "→ Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "  Docker already installed"
fi

# Install Docker Compose plugin
echo "→ Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
    apt-get install -y docker-compose-plugin
else
    echo "  Docker Compose already installed"
fi

# Create app directory
echo "→ Creating application directory..."
mkdir -p /opt/sowwwl
cd /opt/sowwwl

# Signals directory (optional, used for server-side signal drops)
echo "→ Creating signals directory..."
mkdir -p /var/www/o
mkdir -p /var/www/o/signals
chown -R www-data:www-data /var/www/o/signals 2>/dev/null || true

# Configure firewall
echo "→ Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw --force enable
    ufw status
fi

# Create .env file template
echo "→ Creating environment file template..."
cat > /opt/sowwwl/.env.example <<'EOF'
DB_HOST=db
DB_PORT=3306
DB_NAME=sowwwl
DB_USER=sowwwl
DB_PASS=CHANGE_THIS_PASSWORD

MYSQL_ROOT_PASSWORD=CHANGE_THIS_ROOT_PASSWORD
API_IMAGE=ghcr.io/sowwwl-source/o-api:latest
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy/clone the project to /opt/sowwwl/ (compose files, scripts, etc.)"
echo "2. Create /opt/sowwwl/.env from .env.example and set passwords"
echo "3. Set up GitHub Actions secrets in your repository"
echo "4. Configure reverse proxy (Caddy/nginx) for HTTPS"
echo "5. Test deployment: docker compose up -d"
echo ""
