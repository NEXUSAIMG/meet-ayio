# Jitsi Meet on Railway

Self-host [Jitsi Meet](https://jitsi.org) — your own video conferencing server — as a 5-service Railway stack. Designed so **3+ participant meetings work on Railway's TCP-only public network** via a bundled coturn TURN server (TURN over TCP with XEP-0215 ephemeral credentials). 1:1 calls go peer-to-peer through the same TURN relay.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/jitsi-template)

> Replace the button URL with the published template URL after publishing.

## Services

| Service | Image (pinned) | Internal ports | Exposure | Volume | RAM |
|---|---|---|---|---|---|
| web | `ghcr.io/jitsi/web:stable-11248` | 8000 (HTTP) | Railway public domain (TLS at the edge) | `/config` | 512 MB |
| prosody | `ghcr.io/jitsi/prosody:stable-11248` | 5222, 5280 | private network only | `/config`, `/var/lib/prosody` | 512 MB |
| jicofo | `ghcr.io/jitsi/jicofo:stable-11248` | 8888 | private network only | `/config` | 512 MB |
| jvb | `ghcr.io/jitsi/jvb:stable-11248` | 10000/udp, 8080 | private network only (no public port) | `/config` | 2048 MB |
| coturn | `coturn/coturn:4.18.0-r0-alpine` | 3478 | **TCP proxy → 3478** (TURN over TCP) | — | 256 MB |

Total: ~3.8 GB RAM. Media path: browser → **TURN over TCP** (`*.proxy.rlwy.net:<port>`) → coturn → UDP over Railway's private mesh → jvb. Railway's public edge cannot carry UDP, and jvb's only ICE harvester is UDP, so TURN is the sole working media path on Railway — that is exactly what this stack wires up.

## Authentication model

`ENABLE_AUTH=1`, `AUTH_TYPE=internal`, `ENABLE_GUESTS=1` (the standard "secure domain" model): registered users are moderators; anyone else joins as a guest. All internal XMPP passwords (`JICOFO_AUTH_PASSWORD`, `JVB_AUTH_PASSWORD`) and the coturn shared secret (`TURN_SHARED_SECRET`) are generated per deployment by Railway expressions — nothing hardcoded.

### Post-deploy: create your moderator account (one command)

Open the **prosody** service in the Railway dashboard → Deployments → **Shell** (or use `railway ssh -s prosody` locally) and run:

```bash
prosodyctl --config /run/prosody/config/prosody.cfg.lua shell user create admin@auth.meet.jitsi 'YourStrongPassword'
```

Log in with `admin` / that password when creating a room; guests join without an account.

## Headless verification scripts

- `scripts/gen-turn-creds.sh <shared-secret> [ttl-seconds]` — prints the time-limited TURN username/password pair (coturn REST credentials scheme) that prosody hands to browsers via XEP-0215.
- `scripts/turn-selftest.sh` — end-to-end headless TURN check against a deployed instance: allocates a relay over the public TCP proxy and relays a packet to jvb:10000/udp across the private network.

## Troubleshooting

- **No audio/video in 3+ person meetings** → check the coturn service is up and its TCP proxy exists (Settings → Networking). TURN_HOST/TURN_PORT on prosody must reference `${{coturn.RAILWAY_TCP_PROXY_DOMAIN}}` / `${{coturn.RAILWAY_TCP_PROXY_PORT}}`, not literals — Railway randomizes proxy ports per deployment.
- **jvb crash-looping** → OOM; `VIDEOBRIDGE_MAX_MEMORY=1792m` must stay below the service RAM cap (2 GB).
- **Login fails / jicofo reconnect loop** → XMPP password mismatch; the values must be identical on prosody and jicofo/jvb (shared via Railway variable references).
- **Permission errors on boot** → Railway volumes mount root-owned; the jitsi images handle this, but if a service fails with EACCES, delete the volume, redeploy, and let it recreate.
- Rooms are ephemeral by design; accounts and config persist on volumes.

## TCP-only disclosure

Railway does not expose UDP publicly. All media (including 1:1) is relayed through coturn over TCP/3478. This costs bandwidth (every participant's media transits coturn twice) and adds a small amount of latency vs direct UDP. TURN over TLS (`turns`, port 5349) is **not** enabled by default: Railway-assigned TCP proxy ports cannot be referenced twice; add a second proxy manually (application port 5349, self-signed cert in coturn) and set `TURNS_HOST`/`TURNS_PORT` on prosody if you need it.
