#!/bin/sh
# Reenvia gravações que falharam (diretórios com .falhou). Rodar por cron, ex.:
#   */15 * * * * docker exec jibri /config/meet-ayio/retry-pending.sh
set -u
RAIZ="${JIBRI_RECORDING_DIR:-/config/recordings}"
SCRIPT="$(dirname "$0")/finalize.sh"
for marca in "$RAIZ"/*/.falhou; do
  [ -e "$marca" ] || continue
  dir=$(dirname "$marca")
  rm -f "$marca"
  "$SCRIPT" "$dir" || true
done
