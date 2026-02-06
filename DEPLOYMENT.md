# Deployment Guide - sowwwl

## Architecture

- **Frontend**: Netlify (static hosting)
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

4. Copy `docker-compose.yml` to `/opt/sowwwl/`

5. Create production `.env` file in `/opt/sowwwl/sowwwl-api-php/.env`:
```bash
DB_HOST=db
DB_PORT=3306
DB_NAME=sowwwl
DB_USER=sowwwl
DB_PASS=<strong-password>
```

### 2. Netlify Setup

1. Create a new site in Netlify
2. Connect your repository or deploy manually
3. Set build settings:
   - Base directory: `sowwwl-front-netlify`
   - Publish directory: `sowwwl-front-netlify`
   - Build command: (leave empty)

4. Update `netlify.toml` with your actual API domain:
```toml
[[redirects]]
  from = "/api/*"
  to = "https://your-api.domain.com/:splat"
  status = 200
  force = true
```

### 3. GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `DO_HOST`: Your DigitalOcean droplet IP
- `DO_USER`: SSH user (usually `root` or your username)
- `DO_SSH_KEY`: Private SSH key for authentication
- `NETLIFY_AUTH_TOKEN`: From Netlify user settings
- `NETLIFY_SITE_ID`: From Netlify site settings

## Local Development

Start the full stack locally:

```bash
docker compose up -d
```

- API: http://localhost:8000
- Frontend: Open `sowwwl-front-netlify/index.html` in browser
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

### Frontend (Netlify)

```bash
cd sowwwl-front-netlify
netlify deploy --prod
```

Or simply push to your `main` branch and let GitHub Actions handle it.

## CI/CD Pipeline

### Automatic Deployments

Push to `main` branch triggers:
1. API build and push to GitHub Container Registry
2. Deployment to DigitalOcean via SSH
3. Frontend deployment to Netlify

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
api.sowwwl.com {
    reverse_proxy localhost:8000
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
- Check CORS headers if needed
- Verify Netlify proxy configuration
- Check API is accessible from internet
