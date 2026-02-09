#!/usr/bin/env bash
set -euo pipefail

# AuthorizedPrincipalsCommand hook.
# By default (no args configured in sshd_config), sshd passes only the target username.
# You can pass certificate details via tokens, e.g.:
#   AuthorizedPrincipalsCommand /usr/local/bin/o-authorized-principals %u %i %s %f
# where %i = key id, %s = serial, %f = fingerprint (see sshd_config TOKENS).
#
# For a minimal "single unix user" bastion setup:
# - Create a unix account `o`
# - Sign certs with principal `o`
# - This command returns only `o` for the `o` unix user.

USER="${1:-}"

if [[ "${USER}" == "o" ]]; then
  echo "o"
  exit 0
fi

exit 1
