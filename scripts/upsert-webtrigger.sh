#!/bin/sh
set -eu

# Also sourced by test-deployed.sh so a newly stored URL is usable immediately.
upsert_webtrigger_url() {
  if [ -n "${RPC_VERIFY_URL-}" ]; then
    echo "Using the stored RPC_VERIFY_URL; no Forge lookup performed." >&2
    return 0
  fi

  for target in "${FORGE_SITE-}" "${FORGE_PRODUCT-}" "${FORGE_ENVIRONMENT-}"; do
    case "$target" in
      ''|-*|*[![:graph:]]*)
        echo "Set valid FORGE_SITE, FORGE_PRODUCT, and FORGE_ENVIRONMENT through SecretSpec first." >&2
        return 1 ;;
    esac
  done

  echo "No RPC_VERIFY_URL stored; obtaining the config-rpc URL from Forge." >&2
  if ! output=$(NO_COLOR=1 FORCE_COLOR=0 forge webtrigger create \
    --site "$FORGE_SITE" --product "$FORGE_PRODUCT" \
    --environment "$FORGE_ENVIRONMENT" --functionKey config-rpc 2>/dev/null); then
    echo "Forge webtrigger create failed; no URL was saved. Check Forge authentication and the selected installation." >&2
    return 1
  fi

  # Forge prints a bare URL line. Reject ambiguous output, not documentation links.
  RPC_VERIFY_URL=$(printf '%s\n' "$output" | awk '
    { sub(/\r$/, ""); gsub(/^[[:space:]]+|[[:space:]]+$/, "") }
    /^https:\/\/[^[:space:]]+$/ { url = $0; count++ }
    END { if (count == 1) print url }
  ')
  if [ -z "$RPC_VERIFY_URL" ]; then
    echo "Forge did not return exactly one HTTPS URL line; no URL was saved." >&2
    return 1
  fi

  if ! printf '%s' "$RPC_VERIFY_URL" | secretspec set \
    --provider project_config --from-file - RPC_VERIFY_URL >/dev/null 2>&1; then
    echo "The Forge URL was obtained but SecretSpec could not save RPC_VERIFY_URL. Fix project_config before retrying." >&2
    return 1
  fi
  export RPC_VERIFY_URL
  echo "RPC_VERIFY_URL saved through SecretSpec project_config; URL omitted from output." >&2
}

upsert_webtrigger_url
