#!/usr/bin/env bash
set -euo pipefail

UZYX_HOST="${UZYX_HOST:-0.user.o.sowwwl.cloud}"
FRONT_HOST="${FRONT_HOST:-sowwwl.com}"

if [ "${1:-}" != "" ]; then
  IP="$1"
else
  IP="$(dig +short @1.1.1.1 "${UZYX_HOST}" A | head -n1)"
  if [ -z "${IP}" ]; then
    IP="$(dig +short @1.1.1.1 "${FRONT_HOST}" A | head -n1)"
  fi
fi

if [ -z "${IP}" ]; then
  echo "FAIL: unable to resolve target IP"
  exit 2
fi

echo "IP=${IP}"
echo "UZYX_HOST=${UZYX_HOST}"
echo "FRONT_HOST=${FRONT_HOST}"
echo

fail=0

req() {
  local host="$1"
  local path="$2"
  curl -m 20 -fsS --resolve "${host}:443:${IP}" "https://${host}${path}"
}

head_sha="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"

echo "[1] UZYX build marker"
uzyx_build="$(req "${UZYX_HOST}" "/o.build.json" || true)"
uzyx_id="$(printf '%s' "${uzyx_build}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
if [ -n "${uzyx_id}" ]; then
  echo "OK id=${uzyx_id} (head=${head_sha})"
else
  echo "FAIL: missing/invalid ${UZYX_HOST}/o.build.json"
  fail=1
fi
echo

echo "[2] UZYX API health"
uzyx_health="$(req "${UZYX_HOST}" "/api/health" || true)"
if printf '%s' "${uzyx_health}" | grep -q '"status":"ok"'; then
  echo "OK ${uzyx_health}"
else
  echo "FAIL: /api/health -> ${uzyx_health}"
  fail=1
fi
echo

echo "[3] FRONT build marker"
front_build="$(req "${FRONT_HOST}" "/o.build.json" || true)"
front_id="$(printf '%s' "${front_build}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
if [ -n "${front_id}" ]; then
  echo "OK id=${front_id}"
else
  echo "FAIL: missing/invalid ${FRONT_HOST}/o.build.json"
  fail=1
fi
echo

echo "[4] FRONT shell + inversion signatures"
bicolor="$(req "${FRONT_HOST}" "/assets/js/bicolor.js" || true)"
css="$(req "${FRONT_HOST}" "/assets/css/o.css" || true)"
if printf '%s' "${bicolor}" | grep -q 'SHELL_NEXT_VIEW_KEY' \
  && printf '%s' "${bicolor}" | grep -q 'window.O.invert' \
  && printf '%s' "${css}" | grep -q 'data-shell-view="menu"'; then
  echo "OK shell/invert signatures found"
else
  echo "FAIL: shell/invert signatures missing in live assets"
  fail=1
fi
echo

if [ "${fail}" = "0" ]; then
  echo "DIAG=PASS"
else
  echo "DIAG=FAIL"
  exit 1
fi
