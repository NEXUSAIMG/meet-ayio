# SeuCartório → Meet Ayio (fase 5)

Preparado em 15/10/2026 a partir do código atual do SeuCartório
(`backend/src/routes/video.routes.js` @ `d81b91e`). **Nada foi alterado no
repo do SeuCartório ainda**; aplicar quando o Meet Ayio estiver no ar.

## Por que é pequeno

O SeuCartório já cuida de salas (`sc-` + 24 hex), convites, agenda, presença e
documento. Do provedor ele só precisa de: **JWT da sala + domínio + script**.
A troca fica atrás de uma variável, `VIDEO_PROVIDER=jaas|meetayio`, com volta
instantânea para o 8x8 se algo der errado.

## Passo 1 — cadastrar o SeuCartório no Meet Ayio

```bash
curl -X POST https://<meet-ayio-api>/admin/clients \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"slug":"seucartorio","name":"SeuCartório","roomPrefix":"sc-"}'
# → guarda o "apiKey" (aparece só uma vez)
```

O prefixo `sc-` é exatamente o que o `video.routes.js` já usa nas salas.

## Passo 2 — backend

1. Copiar `videoProvider.service.js` para `backend/src/services/`.
2. Em `video.routes.js`:
   - remover `APP_ID`, `KID`, `PRIVATE_KEY`, `configurado()` e `gerarToken()`;
   - `const video = require('../services/videoProvider.service');`
   - trocar `configurado()` por `video.configurado()` (3 lugares);
   - nas duas respostas de entrada (`/convite/:token/entrar` e `/:id/token`),
     trocar o bloco `appId / roomName / jwt` por:

```js
const sala = await video.gerarSala({ user: convidado, room: sessao.room, moderator: false });
return res.json({
  titulo: sessao.titulo,
  ...sala,              // jwt, roomName, domain, scriptUrl, appId
  moderator: false,
  participanteId,
});
```
   (no `/:id/token`: `user: req.usuario`, `moderator: admin`, e manter `salaEspera`).
   - a mensagem de 503 "variáveis JAAS_*" vira "Videoconferência não configurada".

## Passo 3 — frontend (`pages/video/[id].js` e `pages/video/convidado/[token].js`)

```js
// antes: new window.JitsiMeetExternalAPI('8x8.vc', { ... })
new window.JitsiMeetExternalAPI(dados.domain || '8x8.vc', { ... })

// antes: src={`https://8x8.vc/${dados.appId}/external_api.js`}
src={dados.scriptUrl || `https://8x8.vc/${dados.appId}/external_api.js`}
```

No `[id].js`, a condição `{dados?.appId && (<Script …/>)}` passa a ser
`{(dados?.scriptUrl || dados?.appId) && (…)}`.

Com o fallback, o frontend funciona com os dois provedores; dá pra subir o
frontend antes e virar o backend depois.

## Passo 4 — virar a chave (Railway/Vercel do backend)

```
VIDEO_PROVIDER=meetayio
MEET_AYIO_API_URL=https://<meet-ayio-api>
MEET_AYIO_API_KEY=mak_...
```

Voltar para o 8x8: `VIDEO_PROVIDER=jaas` (as variáveis `JAAS_*` continuam lá).

## O que muda para o usuário

- Domínio da sala: `8x8.vc` → domínio do Meet Ayio.
- Lobby (`toggleLobby`), prejoin, contador de participantes e eventos
  (`readyToClose`, `cameraError`...) são da External API do Jitsi e funcionam
  igual no self-hosted.
- Moderador vem do token (`context.user.moderator`) — conferir no teste da
  fase 2/3 se o prosody está respeitando (ver `infra/README.md`).

---

# Gravações (fases 6–7)

Também pronto para aplicar, depois que o Jibri estiver no ar.

## O que o SeuCartório ganha

- Moderador vê o botão **Iniciar gravação** na chamada (o token de moderador
  já vem com permissão de gravar; para desligar numa sessão, passar
  `features: { recording: false }` na chamada de token).
- Quando a gravação termina, o Meet Ayio chama
  `POST /api/webhooks/meet-ayio` com o evento `recording.ready`, assinado.
- O painel lista as gravações da sessão, gera link de download (15 min) e
  permite apagar antes do prazo (pedido do titular).
- Apagamento automático após a retenção do cliente (padrão 30 dias,
  configurável por cliente no Meet Ayio).

## Passo 1 — model (backend/prisma/schema.prisma)

Mesmo padrão do schema (sem relação Prisma, `sessionId` como String):

```prisma
model VideoGravacao {
  id           String    @id @default(uuid())
  gravacaoId   String    @unique @map("gravacao_id")   // id no Meet Ayio
  sessionId    String    @map("session_id")
  empresaId    String?   @map("empresa_id")
  tamanhoBytes BigInt    @default(0) @map("tamanho_bytes")
  duracaoSeg   Int?      @map("duracao_seg")
  expiraEm     DateTime? @map("expira_em")
  apagadaEm    DateTime? @map("apagada_em")
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([sessionId])
  @@map("video_gravacoes")
}
```

O arquivo de vídeo **não** fica no SeuCartório: só o id; o download é gerado
na hora pelo Meet Ayio.

## Passo 2 — rotas

1. Copiar `videoGravacao.routes.js` para `backend/src/routes/`.
   (`videoProvider.service.js` já tem `obterGravacao`, `apagarGravacao` e
   `verificarWebhook`.)
2. No `server.js`, **antes** do `express.json()` global (o webhook precisa do
   corpo cru para conferir a assinatura) e antes do `video.routes`:

```js
const videoGravacao = require('./routes/videoGravacao.routes');
app.use('/api/webhooks/meet-ayio', videoGravacao.webhook);
app.use('/api/video-sessions', videoGravacao.gravacoes);
```

Rotas novas:

| Método | Rota | Quem |
|---|---|---|
| POST | `/api/webhooks/meet-ayio` | Meet Ayio (assinatura HMAC) |
| GET | `/api/video-sessions/:id/gravacoes` | quem gerencia a sessão |
| GET | `/api/video-sessions/gravacoes/:gravacaoId/download` | idem → `{ url }` |
| DELETE | `/api/video-sessions/gravacoes/:gravacaoId` | idem |

## Passo 3 — variáveis

```
MEET_AYIO_WEBHOOK_SECRET=whsec_...   # devolvido no cadastro do cliente
```

E no Meet Ayio, apontar o webhook do cliente:

```bash
curl -X PATCH https://<meet-ayio-api>/admin/clients/seucartorio \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"webhookUrl":"https://<backend-seucartorio>/api/webhooks/meet-ayio"}'
# testar: POST /api/v1/webhooks/test com a API key do SeuCartório → { delivered: true }
```

## Comportamento do webhook

- Resposta 2xx = entregue. 5xx/timeout = o Meet Ayio tenta de novo (na hora,
  30 s, 5 min, 30 min). Sala desconhecida responde 2xx (não adianta repetir).
- O mesmo evento pode chegar mais de uma vez → a rota usa `upsert` por
  `gravacaoId`.
- Assinatura recusada se tiver mais de 5 minutos (proteção contra replay).
