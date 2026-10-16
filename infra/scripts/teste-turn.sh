#!/usr/bin/env bash
# Teste do caminho de midia: TCP proxy publico -> coturn -> UDP privado -> jvb.
# Roda de uma maquina com o Railway CLI logado no projeto.
#
#   TURN_PROXY=xxxx.proxy.rlwy.net:12345 TURN_SECRET=... ./teste-turn.sh
#
# Passa se o turnutils_uclient (rodando dentro do coturn, mas entrando pelo
# endereco PUBLICO do proxy) consegue alocar um relay e mandar pacotes ao jvb.
set -euo pipefail

TURN_PROXY="${TURN_PROXY:?ex.: TURN_PROXY=xxxx.proxy.rlwy.net:12345}"
TURN_SECRET="${TURN_SECRET:?o mesmo TURN_SECRET do coturn/prosody}"
HOST="${TURN_PROXY%:*}"
PORTA="${TURN_PROXY##*:}"

# Credencial temporaria no mesmo esquema que o prosody entrega aos navegadores:
# usuario = validade (unix), senha = base64(HMAC-SHA1(segredo, usuario))
USUARIO=$(( $(date +%s) + 600 ))
SENHA=$(printf %s "$USUARIO" | openssl dgst -binary -sha1 -hmac "$TURN_SECRET" | base64)

echo "1) IP privado do jvb visto pelo coturn"
JVB_IP=$(railway ssh -s coturn -- sh -c 'dig +short AAAA jvb.railway.internal; dig +short A jvb.railway.internal' | grep -E '^[0-9a-fA-F.:]+$' | head -1 | tr -d '\r')
[ -n "$JVB_IP" ] || { echo "FALHOU: jvb.railway.internal nao resolve dentro do coturn"; exit 1; }
echo "   $JVB_IP"

echo "2) Relay TURN/TCP pelo proxy publico $HOST:$PORTA ate $JVB_IP:10000/udp"
SAIDA=$(railway ssh -s coturn -- sh -c "turnutils_uclient -t -n 3 -u $USUARIO -w '$SENHA' -e $JVB_IP -r 10000 -p $PORTA $HOST" 2>&1 || true)
echo "$SAIDA" | tail -n 15

# -t = cliente fala TCP com o coturn (como o navegador); relay sai em UDP.
# O jvb nao responde a esses pacotes, entao "lost" alto e normal: o que
# importa e a alocacao ter dado certo e o envio ter terminado.
if echo "$SAIDA" | grep -qiE 'Total transmit time'; then
  echo "OK: alocacao e envio pelo relay funcionaram"
else
  echo "VERIFICAR: sem confirmacao de envio; ver logs do coturn (railway logs -s coturn)"
  exit 2
fi
