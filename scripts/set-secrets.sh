#!/usr/bin/env bash
# Asks for each named secret in turn (hidden input) and stores it on the Worker.
# Values are never printed or written to disk.
#
#   scripts/set-secrets.sh second GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN
#   scripts/set-secrets.sh default   SOME_SECRET
set -euo pipefail
cd "$(dirname "$0")/.."

[[ $# -ge 2 ]] || { echo "usage: $0 <env|default> NAME [NAME...]" >&2; exit 1; }
TARGET="$1"; shift
ENV_ARGS=()
[[ "$TARGET" != "default" ]] && ENV_ARGS=(--env "$TARGET")

ask() {
  if [[ -t 0 ]]; then
    local v; read -r -s -p "$1: " v; echo >&2; printf '%s' "$v"
  else
    osascript -e "text returned of (display dialog \"$1\" default answer \"\" with hidden answer with title \"Worker secrets ($TARGET)\")"
  fi
}

for NAME in "$@"; do
  V="$(ask "$NAME")"; V="${V//[[:space:]]/}"
  if [[ -z "$V" ]]; then echo "$NAME: empty, skipped"; continue; fi
  printf '%s' "$V" | npx wrangler secret put "$NAME" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} 2>&1 | grep -E 'Success|ERROR|✘'
  unset V
done
