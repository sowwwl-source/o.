#!/usr/bin/env bash
set -euo pipefail

# Ensure Apache serves the sowwwl static homepage from /var/www/sowwwl-front
# and proxies /api/* to the local PHP API container.
#
# This is intended to be run on the droplet (as root).
# It is idempotent and will disable conflicting vhosts for the same hostnames.
#
# Hosts:
# - sowwwl.cloud (primary)
# - www.sowwwl.cloud (alias)
#
# Optional:
# - export TLS_CERT_FILE=/path/to/fullchain-or-origin-cert.pem
# - export TLS_KEY_FILE=/path/to/private-key.pem
#   If omitted, the script falls back to Let's Encrypt discovery.

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "[ensure-apache-front-site] must run as root" >&2
  exit 1
fi

if ! command -v apache2ctl >/dev/null 2>&1; then
  echo "[ensure-apache-front-site] apache2 not found; skipping" >&2
  exit 0
fi

SITE_NAME="front-sowwwl-cloud"
DOCROOT="/var/www/sowwwl-front"
API_UPSTREAM="http://127.0.0.1:8000/"

PRIMARY_HOST="sowwwl.cloud"
ALIASES=("www.sowwwl.cloud")

TLS_CERT_FILE="${TLS_CERT_FILE:-}"
TLS_KEY_FILE="${TLS_KEY_FILE:-}"

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

CERT_FILE=""
KEY_FILE=""
if [ -n "${TLS_CERT_FILE}" ] || [ -n "${TLS_KEY_FILE}" ]; then
  if [ ! -r "${TLS_CERT_FILE}" ] || [ ! -r "${TLS_KEY_FILE}" ]; then
    echo "[ensure-apache-front-site] TLS_CERT_FILE / TLS_KEY_FILE unreadable; aborting" >&2
    exit 1
  fi
  CERT_FILE="${TLS_CERT_FILE}"
  KEY_FILE="${TLS_KEY_FILE}"
  echo "[ensure-apache-front-site] using explicit TLS files"
else
  CERT_DIR="$(find_le_cert_dir_for_host "${PRIMARY_HOST}" || true)"
  if [ -z "${CERT_DIR}" ]; then
    CERT_DIR="$(find_le_cert_dir_for_host "${ALIASES[0]}" || true)"
  fi
  if [ -z "${CERT_DIR}" ]; then
    echo "[ensure-apache-front-site] could not find a Let's Encrypt cert for ${PRIMARY_HOST}; aborting" >&2
    exit 1
  fi
  CERT_FILE="${CERT_DIR}/fullchain.pem"
  KEY_FILE="${CERT_DIR}/privkey.pem"
  echo "[ensure-apache-front-site] using cert dir: ${CERT_DIR}"
fi

mkdir -p "${DOCROOT}"

echo "[ensure-apache-front-site] enabling apache modules"
a2enmod ssl headers proxy proxy_http rewrite mime >/dev/null || true

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
        echo "[ensure-apache-front-site] disabling conflicting site: ${name} (host=${host})"
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
ALIASES_LINE=""
if [ "${#ALIASES[@]}" -gt 0 ]; then
  ALIASES_LINE="  ServerAlias ${ALIASES[*]}"
fi
cat > "${TMP}" <<EOF
<VirtualHost *:80>
  ServerName ${PRIMARY_HOST}
${ALIASES_LINE}

  RewriteEngine On
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
  ServerName ${PRIMARY_HOST}
${ALIASES_LINE}

  DocumentRoot ${DOCROOT}
  DirectoryIndex index.html

  SSLEngine on
  SSLCertificateFile ${CERT_FILE}
  SSLCertificateKeyFile ${KEY_FILE}
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

echo "[ensure-apache-front-site] enabling site: ${SITE_NAME}"
a2ensite "${SITE_NAME}" >/dev/null || true

echo "[ensure-apache-front-site] apache configtest"
apache2ctl configtest

echo "[ensure-apache-front-site] reloading apache"
systemctl reload apache2

echo "[ensure-apache-front-site] ok"
