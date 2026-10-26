#!/bin/sh
set -eu

# Refuse before URL creation as well as before the verifier's own HTTP preflight.
if [ "${FORGE_ENVIRONMENT-}" != development ] ||
   [ "${FORGE_PRODUCT-}" != jira ]; then
  echo "Deployed verification requires SecretSpec FORGE_ENVIRONMENT=development and FORGE_PRODUCT=jira. No Forge or HTTP calls were made." >&2
  exit 1
fi

. ./scripts/upsert-webtrigger.sh
# An empty optional value means no isolation check, not an invalid endpoint.
if [ -z "${RPC_VERIFY_ISOLATION_URL-}" ]; then
  unset RPC_VERIFY_ISOLATION_URL
fi
exec node --experimental-strip-types test/deployed/run.ts
