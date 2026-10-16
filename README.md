# Meet Ayio

Videoconferência própria (Jitsi self-hosted no Railway) com API para os
produtos Ayio. Primeiro cliente: SeuCartório (sai do 8x8 JaaS).

| Pasta | O que é |
|---|---|
| `infra/` | stack Jitsi: web, prosody, jicofo, jvb, coturn (TURN sobre TCP) |
| `infra/jibri/` | gravação: Jibri (VPS) + script que envia o mp4 para a API |
| `api/` | meet-ayio-api (Node/Express + Prisma/MySQL): clientes, salas, JWT, gravações, webhooks, uso |
| `integracoes/seucartorio/` | troca JaaS → Meet Ayio e gravações, prontas para aplicar no SeuCartório |
| `docs/` | plano e decisões |

## API (v0.3)

**Clientes** autenticam com `x-api-key`. Cada cliente tem um prefixo de sala
(ex.: `sc-`) e só emite token para salas com esse prefixo.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/v1/tokens` | `{ room, user: { id, name, email }, moderator, features? }` → `{ token, roomName, domain, scriptUrl, expiresIn, joinUrl }` |
| POST | `/api/v1/sessions` | `{ prefix?, title? }` → sala com nome não adivinhável |
| POST | `/api/v1/sessions/:room/token` | igual a `/tokens`, sala na URL |
| GET | `/api/v1/recordings?room=` | gravações disponíveis |
| GET | `/api/v1/recordings/:id` | detalhes + `downloadUrl` (15 min) |
| DELETE | `/api/v1/recordings/:id` | apaga já (pedido do titular) |
| POST | `/api/v1/recordings/:id/webhook` | reenvia `recording.ready` |
| POST | `/api/v1/webhooks/test` | manda um `ping` para o webhook do cliente |
| GET | `/api/v1/usage?from=&to=` | sessões, tokens, gravações, minutos e bytes gravados |

Moderador recebe token com `features.recording = true` (botão "Gravar" no
Jitsi); participante não. Gravar começa e para **dentro da chamada**.

**Admin** (`Authorization: Bearer $ADMIN_TOKEN`):

| Método | Rota | O que faz |
|---|---|---|
| POST | `/admin/clients` | `{ slug, name, roomPrefix, webhookUrl?, recordingRetentionDays? }` → devolve `apiKey` e `webhookSecret` **uma única vez** |
| GET | `/admin/clients` | lista (sem segredos) |
| POST | `/admin/clients/:slug/rotate-key` | nova API key; a antiga para na hora |
| POST | `/admin/clients/:slug/rotate-webhook-secret` | novo segredo de webhook |
| PATCH | `/admin/clients/:slug` | `{ active, name, webhookUrl, recordingRetentionDays }` |

**Interno** (`Authorization: Bearer $RECORDER_SECRET`): `PUT /internal/recordings?room=&durationSec=`
com o mp4 no corpo — usado pelo `infra/jibri/finalize.sh`.

### Webhooks

`POST` no `webhookUrl` do cliente, corpo `{ id, event, createdAt, data }`,
headers `x-meetayio-event` e `x-meetayio-signature: t=<unix>,v1=<hmac>` onde
`v1 = HMAC-SHA256(webhookSecret, "<t>.<corpo cru>")`. Tentativas: na hora,
30 s, 5 min, 30 min (2xx = entregue). Eventos: `recording.ready`, `ping`.

### Retenção

Cada gravação expira em `recordingRetentionDays` (padrão 30). Um job de hora
em hora apaga arquivo e marca o registro como `DELETED`.

## Rodando

```bash
cd api
cp .env.example .env     # sem DATABASE_URL usa memória + MEET_AYIO_SEED_CLIENTS
npm install
npm test                 # unitários (+ integração se TEST_DATABASE_URL)
npm start
```

Teste contra MySQL real:
`DATABASE_URL=... npm run migrate && TEST_DATABASE_URL=$DATABASE_URL npm test`

Smoke contra uma API no ar: `API_URL=... ADMIN_TOKEN=... npm run smoke`

## Railway (API)

Novo serviço a partir deste repo, Root Directory = `api`, mais um MySQL do
Railway (`DATABASE_URL=${{MySQL.MYSQL_URL}}`). O `railway.json` roda
`prisma migrate deploy` antes de cada deploy e usa `/health` como healthcheck.
Gravações: volume montado em `/data` (`RECORDINGS_DIR=/data/recordings`) ou
Railway Bucket (`S3_*`).

## Fases

Ver `docs/plano-meet-ayio.md`.
