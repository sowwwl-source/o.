# sowwwl Deployment Pipeline

Complete CI/CD pipeline with Docker, GitHub Actions, and production deployment.

## 📦 What's Included

### Docker Setup
- **Dockerfile** for PHP API (Alpine-based, optimized for production)
- **docker-compose.yml** for local development
- **sowwwl-api-php/docker-compose.prod.yml** for production overrides
- **.dockerignore** to exclude unnecessary files

### CI/CD Workflows
- **deploy-api.yml** - Automated API deployment to DigitalOcean
- **deploy-frontend.yml** - Automated frontend deployment to DigitalOcean (static files)
- **deploy-uzyx.yml** - Automated uzyx-app deployment to `/var/www/o` (keeps `/var/www/o/signals`)

### Frontends
- `sowwwl-front/` — legacy/static site (served on `sowwwl.com`)
- `uzyx-app/` — O. “UI globale” (React build output served on `0.user.o.sowwwl.cloud`)

### Scripts & Tools
- **Makefile** for common development tasks
- **setup-production.sh** for server initialization
- **Caddyfile.example** for HTTPS reverse proxy (recommended)
- **nginx.conf.example** for nginx reverse proxy (alternative)

## 🚀 Quick Start (Local Development)

```bash
# Live preview (frontend + /api proxy to production, no Docker needed)
make preview

# Start everything
make dev

# View logs
make logs

# Initialize database
make init-db

# Test API
make test

# Stop everything
make down
```

## 🌐 Production Deployment Setup

### 1. DigitalOcean Droplet Setup

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Run setup script
bash <(curl -s https://raw.githubusercontent.com/your-repo/main/scripts/setup-production.sh)

# Or manually:
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/sowwwl
```

### 2. Configure Environment

Create `/opt/sowwwl/.env`:
```env
DB_HOST=db
DB_PORT=3306
DB_NAME=sowwwl
DB_USER=sowwwl
DB_PASS=<strong-random-password>

MYSQL_ROOT_PASSWORD=<strong-random-password>
```

### 3. Set Up Reverse Proxy (HTTPS)

**Option A: Caddy (Easiest - Automatic HTTPS)**
```bash
apt install -y caddy
cp scripts/Caddyfile.example /etc/caddy/Caddyfile
# Edit domain name
systemctl enable caddy
systemctl start caddy
```

**Option B: nginx + Certbot**
```bash
apt install -y nginx certbot python3-certbot-nginx
cp scripts/nginx.conf.example /etc/nginx/sites-available/sowwwl
certbot --nginx -d sowwwl.com -d www.sowwwl.com
certbot --nginx -d api.sowwwl.com
```

### 4. GitHub Repository Secrets

Add these in `Settings → Secrets and variables → Actions`:

| Secret | Description | Example |
|--------|-------------|---------|
| `DO_HOST` | Droplet IP address | `165.232.123.45` |
| `DO_USER` | SSH username | `root` |
| `DO_SSH_KEY` | Private SSH key | `-----BEGIN...` |

### 5. Deploy!

```bash
# Push to main branch triggers automatic deployment
git push origin main

# Or manually deploy
docker compose -f docker-compose.yml -f sowwwl-api-php/docker-compose.prod.yml up -d
```

## 📊 Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│ DigitalOcean Droplet          │
│                               │
│  ┌────────────┐               │
│  │ Caddy/nginx│               │
│  │ (HTTPS)    │               │
│  ├─────┬──────┤               │
│  │     │      │               │
│  │  Static     │  /api/*       │
│  │  Front      │  reverse_proxy│
│  │  (/var/www) │  → API        │
│  │             │               │
│  └─────┬──────┘               │
│        │                      │
│  ┌─────▼──────┐               │
│  │  PHP API   │ (Docker)      │
│  └─────┬──────┘               │
│        │                      │
│  ┌─────▼──────┐               │
│  │   MySQL    │ (Docker)      │
│  └────────────┘               │
└───────────────────────────────┘
```

## 🔄 CI/CD Workflow

### On Push to Main:

1. **API Build**: Docker image built and pushed to GitHub Container Registry
2. **API Deploy**: SSH to DO droplet, pull latest image, restart container
3. **Frontend Deploy**: Upload `sowwwl-front/` static files to the droplet (served by Caddy/nginx)

### Caching:

- Docker layer caching enabled via GitHub Actions cache
- Build times: ~30s (cached) to ~2min (fresh)

## 🛠️ Common Tasks

### View Production Logs
```bash
ssh user@your-droplet
cd /opt/sowwwl
docker compose logs -f api
```

### Update API Manually
```bash
cd /opt/sowwwl
docker compose pull api
docker compose up -d api
```

### Database Backup
```bash
docker compose exec db mysqldump -u sowwwl -p sowwwl > backup.sql
```

### Database Restore
```bash
docker compose exec -T db mysql -u sowwwl -p sowwwl < backup.sql
```

### Rollback Deployment
```bash
# Pull specific version
docker pull ghcr.io/your-username/sowwwl/api:main-abc123
# Update docker-compose.yml with specific tag
docker compose up -d api
```

## 🔒 Security Checklist

- [x] HTTPS enabled (via Caddy/nginx)
- [x] Strong database passwords
- [x] Firewall configured (ports 22, 80, 443 only)
- [x] Security headers set
- [x] Session cookies: secure, httponly, samesite
- [ ] Set up database backups (daily recommended)
- [ ] Enable fail2ban for SSH protection
- [ ] Configure log rotation
- [ ] Set up monitoring (optional: UptimeRobot, Datadog)

## 📈 Monitoring & Debugging

### Health Check
```bash
curl https://api.sowwwl.com/health
```

### Check Container Status
```bash
docker compose ps
```

### Database Connection Test
```bash
docker compose exec api php -r "
  new PDO('mysql:host=db;dbname=sowwwl', 'sowwwl', 'password');
  echo 'OK';
"
```

### GitHub Actions Logs
- View in GitHub: `Actions` tab → Select workflow run

## 🆘 Troubleshooting

**Problem: API not responding**
```bash
# Check if container is running
docker compose ps api

# Check logs
docker compose logs api

# Restart
docker compose restart api
```

**Problem: Database connection failed**
```bash
# Check database is running
docker compose ps db

# Check credentials
docker compose exec api env | grep DB_

# Test connection
docker compose exec db mysql -u sowwwl -p
```

**Problem: GitHub Actions deployment fails**
```bash
# Check secrets are set correctly
# Verify SSH access: ssh user@host
# Check droplet has enough disk space: df -h
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [PHP Docker Images](https://hub.docker.com/_/php)

## 🤝 Contributing

When deploying changes:
1. Test locally with `make dev`
2. Commit with descriptive messages
3. Push to feature branch first
4. Merge to main for automatic deployment

---

**Need help?** Check `DEPLOYMENT.md` for detailed setup instructions.
