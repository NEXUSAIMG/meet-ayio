#!/bin/sh
# Render turnserver.conf from real environment variables at runtime.
# (Railway start commands get no shell expansion, so this cannot be a start command.)
{
  echo "listening-port=3478"
  echo "fingerprint"
  echo "use-auth-secret"
  echo "static-auth-secret=${TURN_SHARED_SECRET}"
  echo "realm=${REALM}"
  echo "no-multicast-peers"
  echo "no-cli"
  echo "no-tls"
  echo "no-dtls"
  echo "min-port=49160"
  echo "max-port=49200"
  echo "simple-log"
  echo "log-file=stdout"
} > /tmp/turnserver.conf
exec turnserver -c /tmp/turnserver.conf
