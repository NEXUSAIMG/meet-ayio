#!/usr/bin/env bash
# Generate coturn REST / XEP-0215 style time-limited TURN credentials.
# Usage: gen-turn-creds.sh <shared-secret> [ttl-seconds]
# Prints: username=<expiry-ts> password=<base64 hmac>
set -euo pipefail
SECRET="${1:?usage: gen-turn-creds.sh <shared-secret> [ttl-seconds]}"
TTL="${2:-300}"
USER=$(( $(date +%s) + TTL ))
PASS=$(printf %s "$USER" | openssl dgst -binary -sha1 -hmac "$SECRET" | base64)
echo "username=$USER"
echo "password=$PASS"
echo "credential-turn-common test -T -u $USER -w $PASS"
