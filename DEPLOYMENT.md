# Deployment Guide - sowwwl

## Architecture

- **Frontend**: DigitalOcean Droplet (static hosting via Caddy/nginx)
- **Backend API**: DigitalOcean Droplet (Docker container)
- **Database**: MySQL 8.0 (Docker container on DO)

## Prerequisites

### 1. DigitalOcean Setup

1. Create a Droplet (Ubuntu 22.04 recommended)
2. Install Docker and Docker Compose:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

3. Create deployment directory:
```bash
sudo mkdir -p /opt/sowwwl
sudo chown $USER:$USER /opt/sowwwl
```

4. Copy/clone the project to `/opt/sowwwl/` (or at least `docker-compose.yml` and `sowwwl-api-php/docker-compose.prod.yml`)

5. Create production `.env` file in `/opt/sowwwl/.env` (from `.env.example`):
```bash
DB_HOST=db
DB_PORT=3306
DB_NAME=sowwwl
DB_USER=sowwwl
DB_PASS=<strong-password>

MYSQL_ROOT_PASSWORD=<strong-root-password>

# Optional (defaults to ghcr.io/sowwwl-source/o-api:latest)
API_IMAGE=ghcr.io/sowwwl-source/o-api:latest
```

### 2. Frontend Setup (Static)

The frontend is just static files in `sowwwl-front/`.

On the droplet, copy it to a web root (example):
```bash
sudo mkdir -p /var/www/sowwwl-front
sudo rsync -a --delete sowwwl-front/ /var/www/sowwwl-front/
```

Then configure your reverse proxy so:
- `sowwwl.com` serves `/var/www/sowwwl-front`
- `/api/*` is proxied to the API and **strips** the `/api` prefix (so `/api/me` → `/me`)

### 3. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `DO_HOST`: Your DigitalOcean droplet IP
- `DO_USER`: SSH user (usually `root` or your username)
- `DO_SSH_KEY`: Private SSH key for authentication

## Local Development

Start the full stack locally:

```bash
docker compose up -d
```

- API: http://localhost:8000
- Frontend: Open `sowwwl-front/index.html` in browser (static)
- Database: localhost:3306

Test the API:
```bash
curl http://localhost:8000/health
```

## Database Setup

Initialize the database schema:

```bash
# Local
docker compose exec db mysql -u sowwwl -psowwwlpass sowwwl < sowwwl-api-php/schema.sql

# Production (on DO droplet)
cd /opt/sowwwl
docker compose exec db mysql -u sowwwl -p<password> sowwwl < sowwwl-api-php/schema.sql
```

## Manual Deployment

### Backend (DigitalOcean)

```bash
# On your local machine
cd sowwwl-api-php
docker build -t ghcr.io/<your-username>/sowwwl/api:latest .
docker push ghcr.io/<your-username>/sowwwl/api:latest

# On DO droplet
cd /opt/sowwwl
docker compose pull api
docker compose up -d api
```

### Frontend (Droplet)

```bash
# From your local machine
rsync -az --delete sowwwl-front/ root@your-droplet-ip:/var/www/sowwwl-front/
```
Or simply push to your `main` branch and let GitHub Actions handle it (if enabled).

## CI/CD Pipeline

### Automatic Deployments

Push to `main` branch triggers:
1. API build and push to GitHub Container Registry
2. Deployment to DigitalOcean via SSH
3. Frontend deployment to the droplet (static files)

### Workflow Files

- `.github/workflows/deploy-api.yml` - Backend deployment
- `.github/workflows/deploy-frontend.yml` - Frontend deployment

## Monitoring

### Health Checks

API health endpoint:
```bash
curl https://your-api.domain.com/health
```

### Logs

View API logs:
```bash
docker compose logs -f api
```

View database logs:
```bash
docker compose logs -f db
```

## Security Checklist

- [ ] Use HTTPS for API (configure reverse proxy: nginx/Caddy)
- [ ] Set strong database passwords
- [ ] Configure firewall (only ports 80, 443, 22)
- [ ] Enable automatic security updates
- [ ] Set up database backups
- [ ] Rotate secrets regularly
- [ ] Use GitHub secret scanning

## Reverse Proxy (Recommended)

For production, use Caddy or nginx as reverse proxy:

### Caddy (Easy HTTPS)

```bash
# Install Caddy on DO droplet
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Caddyfile:
```
sowwwl.com, www.sowwwl.com {
    root * /var/www/sowwwl-front

    # Same-origin proxy for cookies/auth (strips /api)
    handle_path /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    file_server
}

api.sowwwl.com {
    reverse_proxy 127.0.0.1:8000
}
```

## Troubleshooting

### API won't start
- Check environment variables: `docker compose exec api env`
- Check database connection: `docker compose exec api php -r "new PDO('mysql:host=db;dbname=sowwwl', 'sowwwl', 'password');"`

### Database connection failed
- Check database is running: `docker compose ps db`
- Check credentials in `.env`
- Check network: `docker compose exec api ping db`

### Frontend API calls fail
- Verify your reverse proxy rule: `/api/*` must strip `/api` when proxying
- Check API is reachable from the proxy: `curl http://localhost:8000/health`
- If you bypass the proxy (calling `api.sowwwl.com` directly), cookies/auth will likely break
