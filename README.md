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

## API (v0.5)

**Clientes** autenticam com `x-api-key`. Cada cliente tem um prefixo de sala
(ex.: `sc-`) e só emite token para salas com esse prefixo.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/v1/tokens` | `{ room, user: { id, name, email }, moderator, features? }` → `{ token, roomName, domain, scriptUrl, expiresIn, joinUrl, recording: { allowed, reason? } }` |
| POST | `/api/v1/sessions` | `{ prefix?, title? }` → sala com nome não adivinhável |
| POST | `/api/v1/sessions/:room/token` | igual a `/tokens`, sala na URL |
| GET | `/api/v1/recordings?room=` | gravações disponíveis |
| GET | `/api/v1/recordings/:id` | detalhes + `downloadUrl` (15 min) |
| DELETE | `/api/v1/recordings/:id` | apaga já (pedido do titular) |
| POST | `/api/v1/recordings/:id/webhook` | reenvia `recording.ready` |
| GET | `/api/v1/recordings/:id/transcript` | transcrição (texto + trechos com tempo) e rascunho de ata |
| POST | `/api/v1/recordings/:id/transcript` | pede (ou refaz com `?force=1`) transcrição + ata |
| POST | `/api/v1/recordings/:id/minutes` | refaz só a ata: `{ participants?, instructions?, title? }` (síncrono) |
| POST | `/api/v1/webhooks/test` | manda um `ping` para o webhook do cliente |
| GET | `/api/v1/usage?from=&to=` | sessões, tokens, gravações, minutos/bytes gravados, minutos transcritos + `quota` do mês |

Moderador recebe token com `features.recording = true` (botão "Gravar" no
Jitsi); participante não. Gravar começa e para **dentro da chamada**.

**Painel de administração:** `https://<api>/admin/painel` (pede o
`ADMIN_TOKEN`). Saúde (fila de transcrição, webhooks que falharam, banco),
clientes com uso do mês e quotas, cadastro/edição de cliente, troca de
chaves, e as gravações de cada cliente (baixar, ver ata, reenviar webhook,
refazer transcrição, apagar).

**Admin** (`Authorization: Bearer $ADMIN_TOKEN`) — o que o painel usa:

| Método | Rota | O que faz |
|---|---|---|
| GET | `/admin/health` | saúde completa (`ok` / `degraded` / `down`, com a lista de problemas) |
| POST | `/admin/clients` | `{ slug, name, roomPrefix, webhookUrl?, recordingRetentionDays?, transcriptionEnabled?, quota*? }` → devolve `apiKey` e `webhookSecret` **uma única vez** |
| GET | `/admin/clients` · `/admin/clients/:slug` | lista / detalhe (sem segredos) |
| POST | `/admin/clients/:slug/rotate-key` | nova API key; a antiga para na hora |
| POST | `/admin/clients/:slug/rotate-webhook-secret` | novo segredo de webhook |
| POST | `/admin/clients/:slug/webhook-test` | `ping` no webhook do cliente |
| PATCH | `/admin/clients/:slug` | `{ active, name, webhookUrl, recordingRetentionDays, transcriptionEnabled, minutesPrompt, quotaRecordedMinutes, quotaTranscribedMinutes, quotaStorageMb }` |
| GET | `/admin/usage?month=AAAA-MM` | uso de todos os clientes no mês (+ quotas no mês corrente) |
| GET | `/admin/clients/:slug/recordings` | gravações com estado do webhook e da transcrição |
| GET | `/admin/recordings/:id/download` · `/transcript` | link de download / transcrição e ata |
| POST | `/admin/recordings/:id/webhook` · `/transcript` | reenvia `recording.ready` / (re)transcreve (passa por cima da quota) |
| DELETE | `/admin/recordings/:id` | apaga gravação, transcrição e ata |

**Saúde para monitor externo:** `GET /health` (processo vivo, usado pelo
Railway) e `GET /health/ready` (banco responde; 503 se não). Sem detalhes —
o relatório fica em `/admin/health`.

**Interno** (`Authorization: Bearer $RECORDER_SECRET`): `PUT /internal/recordings?room=&durationSec=`
com o mp4 no corpo — usado pelo `infra/jibri/finalize.sh`.

### Webhooks

`POST` no `webhookUrl` do cliente, corpo `{ id, event, createdAt, data }`,
headers `x-meetayio-event` e `x-meetayio-signature: t=<unix>,v1=<hmac>` onde
`v1 = HMAC-SHA256(webhookSecret, "<t>.<corpo cru>")`. Tentativas: na hora,
30 s, 5 min, 30 min (2xx = entregue). Eventos: `recording.ready`,
`transcript.ready`, `transcript.failed`, `recording.deleted`, `ping`.

### Transcrição e ata

Com `transcriptionEnabled` no cliente (opt-in), cada gravação entra numa fila:
ffmpeg extrai o áudio (mono, 16 kHz, 32 kbps) e corta em partes de 20 min →
Whisper (Groq, API compatível com a da OpenAI) transcreve cada parte, com os
tempos ajustados → Claude redige o rascunho de ata → `transcript.ready` com
texto e ata. Regras fixas da ata: fidelidade total, sem atribuir falas (o
Whisper não identifica quem fala), `[inaudível]`, primeira linha "RASCUNHO DE
ATA (gerado por IA — revisar)". O cliente pode trocar só o formato
(`minutesPrompt`). Participantes: nomes dos tokens emitidos para a sala
(guardados por `TOKEN_NAME_RETENTION_DAYS`, padrão 90) ou a lista enviada em
`/minutes`. Falha da IA não perde a transcrição; a fila sobrevive a reinício
(`PENDING`/`PROCESSING` são retomadas).

### Quotas

Opcionais por cliente; **sem limite por padrão** (`null`). Mês = mês UTC.

- `quotaRecordedMinutes`: minutos gravados no mês. Atingiu → o token do
  moderador sai **sem** o botão de gravar (`recording.allowed = false`,
  `reason: "quota_excedida"`); ele continua moderador.
- `quotaStorageMb`: espaço ocupado pelas gravações guardadas. Mesmo efeito.
- `quotaTranscribedMinutes`: minutos transcritos no mês. Atingiu → gravação
  nova é aceita, mas a transcrição falha na hora (`transcript.failed`, erro
  "quota mensal de transcrição atingida") e `POST .../transcript` devolve 429.

São limites "macios": o que já começou termina (uma gravação longa pode
passar do limite). O admin pode subir/zerar a quota a qualquer momento e
forçar uma transcrição pelo painel.

### Retenção

Cada gravação expira em `recordingRetentionDays` (padrão 30). Um job de hora
em hora apaga arquivo, transcrição e ata, marca o registro como `DELETED` e
avisa o cliente com `recording.deleted` (para ele apagar as cópias).

## Rodando

```bash
node scripts/gerar-segredos.js   # cria api/.env, infra/jibri/.env e .env (fora do git)
cd api                   # sem DATABASE_URL usa memória + MEET_AYIO_SEED_CLIENTS
npm install
npm test                 # unitários (+ integração se TEST_DATABASE_URL)
npm start
```

Teste contra MySQL real:
`DATABASE_URL=... npm run migrate && TEST_DATABASE_URL=$DATABASE_URL npm test`

Smoke contra uma API no ar: `API_URL=... ADMIN_TOKEN=... npm run smoke`

## Railway (API)

Novo serviço a partir deste repo, Root Directory = `api`, mais um MySQL do
Railway (`DATABASE_URL=${{MySQL.MYSQL_URL}}`). O build usa o `Dockerfile`
(Node 22 + ffmpeg); o `railway.json` roda `prisma migrate deploy` antes de cada
deploy e usa `/health` como healthcheck.
Gravações: volume montado em `/data` (`RECORDINGS_DIR=/data/recordings`) ou
Railway Bucket (`S3_*`).

## Fases

Ver `docs/plano-meet-ayio.md`.
