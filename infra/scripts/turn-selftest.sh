#!/usr/bin/env bash
# Headless TURN self-test for the Jitsi-on-Railway stack (run from a machine with `railway` CLI access).
# Proves: public TCP proxy -> coturn allocation (TURN over TCP) -> relay across the private mesh -> jvb:10000/udp.
#
# Usage:
#   export PROXY_DOMAIN=<coturn *.proxy.rlwy.net domain>
#   export PROXY_PORT=<assigned tcp proxy port>
#   export TURN_SECRET=<coturn TURN_SHARED_SECRET variable value>
#   ./turn-selftest.sh
set -euo pipefail

PROXY_DOMAIN="${PROXY_DOMAIN:?set PROXY_DOMAIN (coturn TCP proxy domain)}"
PROXY_PORT="${PROXY_PORT:?set PROXY_PORT (coturn TCP proxy port)}"
TURN_SECRET="${TURN_SECRET:?set TURN_SECRET (coturn TURN_SHARED_SECRET)}"

# 1. REST credentials for the shared secret (same scheme prosody's XEP-0215 responses use)
mapfile -t CREDS < <(bash "$(dirname "$0")/gen-turn-creds.sh" "$TURN_SECRET" 300)
U=$(printf '%s\n' "${CREDS[0]}" | cut -d= -f2)
P=$(printf '%s\n' "${CREDS[1]}" | cut -d= -f2)
echo "[1] generated ephemeral creds: username=$U"

# 2. jvb private address (resolved inside the mesh)
JVB_IP=$(railway ssh -s coturn -- sh -c 'getent hosts jvb.railway.internal | awk "{print \$1}"' | tail -1 | tr -d '\r')
echo "[2] jvb private address: $JVB_IP"
[ -n "$JVB_IP" ] || { echo "FAIL: could not resolve jvb.railway.internal from coturn"; exit 1; }

# 3. Allocation + relay through the PUBLIC TCP proxy to jvb's UDP port
echo "[3] turnutils_uclient -T (TURN over TCP) via $PROXY_DOMAIN:$PROXY_PORT, peer=$JVB_IP:10000"
railway ssh -s coturn -- sh -c "turnutils_uclient -v -y -n 2 -T -u $U -w '$P' -e $JVB_IP -p 10000 -p2p $PROXY_DOMAIN $PROXY_PORT" || true

# 4. Evidence from coturn's log side
echo "[4] coturn recent allocation/session log lines:"
railway logs -d -s coturn --pull 2>/dev/null | tail -n 40 | grep -iE 'allocation|session|peer' || \
  echo "(check coturn deploy logs in dashboard for allocation entries)"

echo "DONE. PASS = uclient reported received packets in step [3]."
