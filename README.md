# Meet Ayio

Videoconferência própria (Jitsi self-hosted no Railway) com API para os
produtos Ayio. Primeiro cliente: SeuCartório (sai do 8x8 JaaS).

| Pasta | O que é |
|---|---|
| `infra/` | stack Jitsi: web, prosody, jicofo, jvb, coturn (TURN sobre TCP) |
| `api/` | meet-ayio-api (Node/Express + Prisma/MySQL): clientes, salas, JWT, uso |
| `integracoes/seucartorio/` | troca JaaS → Meet Ayio pronta para aplicar no SeuCartório |
| `docs/` | plano e decisões |

## API (v0.2)

**Clientes** autenticam com `x-api-key`. Cada cliente tem um prefixo de sala
(ex.: `sc-`) e só emite token para salas com esse prefixo.

| Método | Rota | Corpo → Retorno |
|---|---|---|
| POST | `/api/v1/tokens` | `{ room, user: { id, name, email }, moderator }` → `{ token, roomName, domain, scriptUrl, expiresIn, joinUrl }` |
| POST | `/api/v1/sessions` | `{ prefix?, title? }` → `{ roomName, url, domain, scriptUrl }` |
| POST | `/api/v1/sessions/:room/token` | igual a `/tokens`, sala na URL |
| GET | `/api/v1/usage?from=&to=` | sessões, tokens e tokens de moderador (padrão: mês atual) |
| POST | `/api/v1/sessions/:room/recording/start\|stop` | 501 até a fase 6 |

**Admin** autentica com `Authorization: Bearer $ADMIN_TOKEN`.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/admin/clients` | `{ slug, name, roomPrefix }` → cria e devolve a `apiKey` **uma única vez** |
| GET | `/admin/clients` | lista (sem segredos) |
| POST | `/admin/clients/:slug/rotate-key` | nova chave; a antiga para na hora |
| PATCH | `/admin/clients/:slug` | `{ active, name, webhookUrl }` |

No banco só fica o hash SHA-256 da API key.

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

## Fases

Ver `docs/plano-meet-ayio.md`.
