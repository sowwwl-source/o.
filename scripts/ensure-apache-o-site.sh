#!/usr/bin/env bash
set -euo pipefail

# Ensure Apache serves the O. UI (uzyx-app) from /var/www/o
# and proxies /api/* to the local PHP API container.
#
# This is intended to be run on the droplet (as root).
# It is idempotent and will disable conflicting vhosts for the same hostnames.
#
# Hosts:
# - 0.user.o.sowwwl.cloud (primary)
# - o.sowwwl.cloud, sowwwl.cloud, www.sowwwl.cloud (aliases)

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "[ensure-apache-o-site] must run as root" >&2
  exit 1
fi

if ! command -v apache2ctl >/dev/null 2>&1; then
  echo "[ensure-apache-o-site] apache2 not found; skipping" >&2
  exit 0
fi

SITE_NAME="o-sowwwl-cloud"
DOCROOT="/var/www/o"
API_UPSTREAM="http://127.0.0.1:8000/"

PRIMARY_HOST="0.user.o.sowwwl.cloud"
ALIASES=("o.sowwwl.cloud" "sowwwl.cloud" "www.sowwwl.cloud")

find_le_cert_dir_for_host() {
  local host="$1"
  local d
  for d in /etc/letsencrypt/live/*; do
    [ -d "$d" ] || continue
    [ -f "$d/fullchain.pem" ] || continue
    [ -f "$d/privkey.pem" ] || continue
    if openssl x509 -in "$d/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:${host}\\b"; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

CERT_DIR="$(find_le_cert_dir_for_host "${PRIMARY_HOST}" || true)"
if [ -z "${CERT_DIR}" ]; then
  # Fallback: common shared cert.
  CERT_DIR="$(find_le_cert_dir_for_host "sowwwl.cloud" || true)"
fi

if [ -z "${CERT_DIR}" ]; then
  echo "[ensure-apache-o-site] could not find a Let's Encrypt cert for sowwwl.cloud; aborting" >&2
  exit 1
fi

echo "[ensure-apache-o-site] using cert dir: ${CERT_DIR}"

mkdir -p "${DOCROOT}"

echo "[ensure-apache-o-site] enabling apache modules"
a2enmod ssl headers proxy proxy_http rewrite >/dev/null || true

disable_conflicts_for_host() {
  local host="$1"
  local f
  shopt -s nullglob
  for f in /etc/apache2/sites-enabled/*.conf; do
    [ -f "$f" ] || continue
    if grep -qiE "^[[:space:]]*ServerName[[:space:]]+${host}([[:space:]]|\$)" "$f" || \
       grep -qiE "^[[:space:]]*ServerAlias[[:space:]].*\\b${host}\\b" "$f"; then
      local bn name
      bn="$(basename "$f")"
      name="${bn%.conf}"
      if [ "${name}" != "${SITE_NAME}" ]; then
        echo "[ensure-apache-o-site] disabling conflicting site: ${name} (host=${host})"
        a2dissite "${name}" >/dev/null || true
      fi
    fi
  done
  shopt -u nullglob
}

disable_conflicts_for_host "${PRIMARY_HOST}"
for h in "${ALIASES[@]}"; do disable_conflicts_for_host "$h"; done

CONF_PATH="/etc/apache2/sites-available/${SITE_NAME}.conf"
TMP="$(mktemp)"
cat > "${TMP}" <<EOF
<VirtualHost *:80>
  ServerName ${PRIMARY_HOST}
  ServerAlias ${ALIASES[*]}

  RewriteEngine On
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
  ServerName ${PRIMARY_HOST}
  ServerAlias ${ALIASES[*]}

  DocumentRoot ${DOCROOT}

  SSLEngine on
  SSLCertificateFile ${CERT_DIR}/fullchain.pem
  SSLCertificateKeyFile ${CERT_DIR}/privkey.pem
  IncludeOptional /etc/letsencrypt/options-ssl-apache.conf

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"
  RequestHeader set X-Forwarded-SSL "on"

  # Same-origin API proxy: /api/* -> http://127.0.0.1:8000/* (strip /api)
  ProxyPass "/api/" "${API_UPSTREAM}"
  ProxyPassReverse "/api/" "${API_UPSTREAM}"

  <Directory "${DOCROOT}">
    Options -Indexes
    AllowOverride None
    Require all granted
  </Directory>

  # SPA fallback without breaking /api
  RewriteEngine On
  # Never rewrite API or build stamp.
  # NOTE: %{REQUEST_URI} always starts with "/" (more robust than RewriteRule path matching).
  RewriteCond %{REQUEST_URI} ^/api/ [OR]
  RewriteCond %{REQUEST_URI} =/o.build.json
  RewriteRule ^ - [L]

  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule ^ /index.html [L]

  <Files "index.html">
    Header set Cache-Control "no-store"
  </Files>
  <Files "o.build.json">
    Header set Cache-Control "no-store"
  </Files>

  <IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "no-referrer"
  </IfModule>
</VirtualHost>
EOF

install -m 0644 "${TMP}" "${CONF_PATH}"
rm -f "${TMP}"

echo "[ensure-apache-o-site] enabling site: ${SITE_NAME}"
a2ensite "${SITE_NAME}" >/dev/null || true

echo "[ensure-apache-o-site] apache configtest"
apache2ctl configtest

echo "[ensure-apache-o-site] reloading apache"
systemctl reload apache2

echo "[ensure-apache-o-site] ok"
