#!/usr/bin/env bash
# Asks for a Merit Aktiva API ID and key, checks them against Merit, then stores them
# as Worker secrets. Values are never printed or written to disk.
#
#   scripts/set-merit-keys.sh             # default Worker
#   scripts/set-merit-keys.sh second      # --env second
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="${1:-}"
ENV_ARGS=()
[[ -n "$ENV_NAME" ]] && ENV_ARGS=(--env "$ENV_NAME")
TARGET="${ENV_NAME:-default}"
BASE_URL="${MERIT_BASE_URL:-https://aktiva.merit.ee}"

ask() { # ask "<prompt>" -> value on stdout
  if [[ -t 0 ]]; then
    local v; read -r -s -p "$1: " v; echo >&2; printf '%s' "$v"
  else
    osascript -e "text returned of (display dialog \"$1\" default answer \"\" with hidden answer with title \"Merit keys ($TARGET)\")"
  fi
}

ID="$(ask "Merit API ID ($TARGET)")"
KEY="$(ask "Merit API key ($TARGET)")"
ID="${ID//[[:space:]]/}"; KEY="${KEY//[[:space:]]/}"
[[ -n "$ID" && -n "$KEY" ]] || { echo "Empty value, nothing changed." >&2; exit 1; }

# verify before uploading: signature = base64(HMAC-SHA256(key, ApiId + timestamp + body))
TS="$(date -u +%Y%m%d%H%M%S)"; BODY="{}"
SIG="$(printf '%s' "$ID$TS$BODY" | openssl dgst -sha256 -hmac "$KEY" -binary | base64 | sed 's/+/%2B/g; s/\//%2F/g; s/=/%3D/g')"
RESP="$(curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' -d "$BODY" \
  "$BASE_URL/api/v1/getbanks?ApiId=$ID&timestamp=$TS&signature=$SIG")"
CODE="${RESP##*$'\n'}"
if [[ "$CODE" != "200" ]]; then
  echo "Merit rejected the keys (HTTP $CODE: ${RESP%$'\n'*}). Nothing changed." >&2
  exit 1
fi
echo "Keys OK. Banks in this company: $(printf '%s' "${RESP%$'\n'*}" | jq -r '[.[].Name] | join(", ")' 2>/dev/null)"

printf '%s' "$ID"  | npx wrangler secret put MERIT_API_ID  ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} 2>&1 | grep -E 'Success|ERROR|✘'
printf '%s' "$KEY" | npx wrangler secret put MERIT_API_KEY ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} 2>&1 | grep -E 'Success|ERROR|✘'
unset ID KEY
echo "Done: MERIT_API_ID and MERIT_API_KEY set on $TARGET."
