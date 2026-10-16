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
