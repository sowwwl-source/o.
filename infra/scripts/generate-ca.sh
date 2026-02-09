#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CA_DIR="${ROOT_DIR}/infra/ca"
CA_KEY="${CA_DIR}/o_ca"

mkdir -p "${CA_DIR}"

if [[ -f "${CA_KEY}" ]]; then
  echo "CA key already exists: ${CA_KEY}"
  exit 0
fi

ssh-keygen -t ed25519 -f "${CA_KEY}" -N "" -C "o-sshca-ca"
chmod 600 "${CA_KEY}"
chmod 644 "${CA_KEY}.pub"

echo "OK"
echo "CA private: ${CA_KEY}"
echo "CA public : ${CA_KEY}.pub"

