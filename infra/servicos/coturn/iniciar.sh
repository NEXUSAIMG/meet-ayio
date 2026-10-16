#!/bin/sh
# Monta o turnserver.conf a partir das variaveis e inicia o coturn.
#
# Variaveis:
#   TURN_SECRET   (obrigatoria) segredo compartilhado com o prosody
#                 (o prosody entrega credenciais temporarias aos navegadores)
#   TURN_REALM    (padrao meet.jitsi)
#   JVB_HOST      (padrao jvb.railway.internal) - unico destino permitido
#   TURN_EXTRA_PEERS  IPs extras permitidos como destino, separados por virgula
#
# Seguranca: o coturn so repassa midia para o jvb e para ele mesmo (chamada
# 1:1 em que os dois lados usam o relay). Qualquer outro destino e negado,
# para o servidor nao virar um proxy aberto para a rede privada ou a internet.
set -eu

: "${TURN_SECRET:?defina TURN_SECRET}"
REALM="${TURN_REALM:-meet.jitsi}"
JVB_HOST="${JVB_HOST:-jvb.railway.internal}"
CONF=/tmp/turnserver.conf

resolver() {
  # IPv4 e IPv6 (a rede privada do Railway pode ser so IPv6)
  { dig +short A "$1"; dig +short AAAA "$1"; } 2>/dev/null | grep -E '^[0-9a-fA-F.:]+$' || true
}

# O jvb pode ainda nao estar no DNS quando o coturn sobe: espera ate 60 s.
PEERS=""
i=0
while [ $i -lt 30 ]; do
  PEERS=$(resolver "$JVB_HOST")
  [ -n "$PEERS" ] && break
  i=$((i + 1))
  sleep 2
done
[ -n "$PEERS" ] || echo "AVISO: $JVB_HOST nao resolveu; so os peers extras/proprios serao aceitos"

PROPRIOS=$(hostname -i 2>/dev/null | tr ' ' '\n' | grep -v '^$' || true)
EXTRAS=$(echo "${TURN_EXTRA_PEERS:-}" | tr ',' '\n' | grep -v '^$' || true)

{
  echo "listening-port=3478"
  echo "realm=$REALM"
  echo "use-auth-secret"
  echo "static-auth-secret=$TURN_SECRET"
  echo "fingerprint"
  echo "no-tls"
  echo "no-dtls"
  echo "no-cli"
  echo "no-multicast-peers"
  echo "no-software-attribute"
  echo "stale-nonce=600"
  echo "user-quota=12"
  echo "total-quota=1200"
  echo "min-port=49160"
  echo "max-port=49999"
  echo "simple-log"
  echo "log-file=stdout"
  # nega tudo...
  echo "denied-peer-ip=0.0.0.0-255.255.255.255"
  echo "denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"
  # ...menos o jvb, o proprio coturn e os extras
  for ip in $PEERS $PROPRIOS $EXTRAS; do
    echo "allowed-peer-ip=$ip"
  done
} > "$CONF"

echo "coturn: realm=$REALM destinos permitidos: $(echo $PEERS $PROPRIOS $EXTRAS)"
turnserver -c "$CONF" &
PID=$!
trap 'kill -TERM $PID 2>/dev/null; wait $PID || true; exit 0' TERM INT

# Se o jvb for reimplantado, o IP privado dele muda. Confere a cada minuto e,
# se mudar, encerra: o Railway reinicia o servico e a lista e refeita.
ORIGINAL=$(echo "$PEERS" | sort | tr '\n' ' ')
while kill -0 $PID 2>/dev/null; do
  sleep "${TURN_RECHECK_SECONDS:-60}" &
  wait $! || true
  ATUAL=$(resolver "$JVB_HOST" | sort | tr '\n' ' ')
  if [ -n "$ATUAL" ] && [ "$ATUAL" != "$ORIGINAL" ]; then
    echo "coturn: IP do jvb mudou ($ORIGINAL -> $ATUAL); reiniciando"
    kill -TERM $PID 2>/dev/null || true
    wait $PID || true
    exit 1
  fi
done
wait $PID
