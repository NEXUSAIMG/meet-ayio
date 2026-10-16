# Meet Ayio

Videoconferência própria (Jitsi self-hosted no Railway) com API para os
produtos Ayio. Primeiro cliente: SeuCartório (sai do 8x8 JaaS).

| Pasta | O que é |
|---|---|
| `infra/` | stack Jitsi: web, prosody, jicofo, jvb, coturn (TURN sobre TCP) |
| `api/` | meet-ayio-api (Node/Express): cria salas e emite JWT para o Jitsi |
| `docs/` | plano e decisões |

## API (v0.1)

Autenticação: header `x-api-key` (chaves em `MEET_AYIO_API_KEYS`).

| Método | Rota | Retorno |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| POST | `/api/v1/sessions` `{ prefix?, title? }` | `{ roomName, url }` |
| POST | `/api/v1/sessions/:room/token` `{ user: { id, name, email }, moderator }` | `{ token, expiresIn, joinUrl }` |
| POST | `/api/v1/sessions/:room/recording/start\|stop` | 501 (fase 6) |

Salas ficam em memória nesta versão; banco entra na fase 4.

```bash
cd api
cp .env.example .env   # ajustar
npm install
npm test
npm start
```

No Railway: novo serviço a partir deste repo com Root Directory = `api`.

## Fases

Ver `docs/plano-meet-ayio.md`. Atual: **fase 2 — deploy do stack Jitsi**.
