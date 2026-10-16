#!/bin/sh
# Chamado pelo Jibri ao fim de cada gravação (JIBRI_FINALIZE_RECORDING_SCRIPT_PATH):
#   finalize.sh <diretório da gravação>
# Envia o .mp4 para a meet-ayio-api (PUT /internal/recordings), que guarda no
# storage e avisa o cliente por webhook. Em caso de falha o diretório fica no
# disco com um arquivo .falhou; retry-pending.sh reenvia depois.
#
# Variáveis: MEET_AYIO_API_URL, MEET_AYIO_RECORDER_SECRET, MEET_AYIO_KEEP_LOCAL=1 (opcional)
set -u

DIR="${1:?uso: finalize.sh <diretorio-da-gravacao>}"
API="${MEET_AYIO_API_URL:?defina MEET_AYIO_API_URL}"
SEGREDO="${MEET_AYIO_RECORDER_SECRET:?defina MEET_AYIO_RECORDER_SECRET}"
API="${API%/}"

log() { echo "[meet-ayio-finalize] $*" >&2; }

ARQ=$(ls -1 "$DIR"/*.mp4 2>/dev/null | head -n 1)
if [ -z "$ARQ" ]; then
  log "nenhum .mp4 em $DIR"
  exit 1
fi

# Sala: do meeting_url do metadata.json do Jibri; senão, do nome do arquivo (<sala>_<data>.mp4).
SALA=""
if [ -f "$DIR/metadata.json" ]; then
  URL=$(sed -n 's/.*"meeting_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DIR/metadata.json" | head -n 1)
  SALA=$(printf '%s' "$URL" | sed 's/[?#].*//; s#/*$##; s#.*/##')
fi
if [ -z "$SALA" ]; then
  SALA=$(basename "$ARQ" | sed 's/_[0-9-]*\.mp4$//; s/\.mp4$//')
fi
SALA=$(printf '%s' "$SALA" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9-')
if [ -z "$SALA" ]; then
  log "não consegui descobrir a sala de $ARQ"
  touch "$DIR/.falhou"
  exit 1
fi

DUR=""
if command -v ffprobe >/dev/null 2>&1; then
  DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$ARQ" 2>/dev/null | cut -d. -f1)
fi

TENTATIVA=0
while [ "$TENTATIVA" -lt 3 ]; do
  TENTATIVA=$((TENTATIVA + 1))
  CODIGO=$(curl -sS -o "$DIR/.resposta" -w '%{http_code}' --max-time 3600 \
    -X PUT -T "$ARQ" \
    -H "Authorization: Bearer $SEGREDO" -H 'Content-Type: video/mp4' \
    "$API/internal/recordings?room=$SALA&durationSec=$DUR")
  case "$CODIGO" in
    201)
      log "enviado: sala=$SALA arquivo=$(basename "$ARQ") resposta=$(cat "$DIR/.resposta")"
      if [ "${MEET_AYIO_KEEP_LOCAL:-0}" = "1" ]; then
        rm -f "$DIR/.resposta" "$DIR/.falhou"; touch "$DIR/.enviado"
      else
        rm -rf "$DIR"
      fi
      exit 0
      ;;
    400|401|404)
      # Erro definitivo (segredo errado, sala desconhecida...): não adianta repetir agora.
      log "recusado ($CODIGO): $(cat "$DIR/.resposta" 2>/dev/null)"
      break
      ;;
  esac
  log "tentativa $TENTATIVA falhou (HTTP $CODIGO)"
  [ "$TENTATIVA" -lt 3 ] && sleep $((TENTATIVA * ${MEET_AYIO_RETRY_SLEEP:-10}))
done

touch "$DIR/.falhou"
log "mantido em $DIR para reenvio (retry-pending.sh)"
exit 1
