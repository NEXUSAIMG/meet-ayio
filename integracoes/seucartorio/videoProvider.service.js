/**
 * Provedor de video do SeuCartorio: JaaS (8x8) ou Meet Ayio.
 *
 * VIDEO_PROVIDER=jaas (padrao) | meetayio
 *   jaas:     JAAS_APP_ID, JAAS_KID, JAAS_PRIVATE_KEY (como hoje)
 *   meetayio: MEET_AYIO_API_URL, MEET_AYIO_API_KEY
 *
 * gerarSala({ user, room, moderator }) devolve SEMPRE o mesmo formato, que as
 * rotas repassam ao frontend:
 *   { jwt, roomName, domain, scriptUrl, appId }
 * Assim o frontend nao precisa saber qual provedor esta ativo.
 */
const jwt = require('jsonwebtoken');

const PROVEDOR = (process.env.VIDEO_PROVIDER || 'jaas').toLowerCase();
const TOKEN_HORAS = 6;

// ---------- JaaS (8x8) — mesmo codigo do gerarToken atual ----------
const APP_ID = process.env.JAAS_APP_ID;
const KID = process.env.JAAS_KID;
const PRIVATE_KEY = (process.env.JAAS_PRIVATE_KEY || '').replace(/\\n/g, '\n');

function tokenJaas({ user, room, moderator }) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      aud: 'jitsi', iss: 'chat', sub: APP_ID, room,
      nbf: now - 10, exp: now + TOKEN_HORAS * 60 * 60,
      context: {
        user: { id: String(user.id), name: user.nome || user.email, email: user.email || '', avatar: '', moderator },
        features: { recording: false, livestreaming: false, transcription: false, 'outbound-call': false },
      },
    },
    PRIVATE_KEY,
    { algorithm: 'RS256', header: { kid: KID, typ: 'JWT' } }
  );
}

// ---------- Meet Ayio ----------
const MA_URL = (process.env.MEET_AYIO_API_URL || '').replace(/\/$/, '');
const MA_KEY = process.env.MEET_AYIO_API_KEY;

async function salaMeetAyio({ user, room, moderator }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${MA_URL}/api/v1/tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': MA_KEY },
      body: JSON.stringify({
        room,
        moderator: Boolean(moderator),
        user: { id: String(user.id), name: user.nome || user.email, email: user.email || '' },
      }),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Meet Ayio respondeu ${r.status}: ${j.error || 'erro'}`);
    return { jwt: j.token, roomName: j.roomName, domain: j.domain, scriptUrl: j.scriptUrl, appId: null };
  } finally {
    clearTimeout(timer);
  }
}

function configurado() {
  if (PROVEDOR === 'meetayio') return !!(MA_URL && MA_KEY);
  return !!(APP_ID && KID && PRIVATE_KEY);
}

async function gerarSala({ user, room, moderator }) {
  if (PROVEDOR === 'meetayio') return salaMeetAyio({ user, room, moderator });
  return {
    jwt: tokenJaas({ user, room, moderator }),
    roomName: `${APP_ID}/${room}`,
    domain: '8x8.vc',
    scriptUrl: `https://8x8.vc/${APP_ID}/external_api.js`,
    appId: APP_ID,
  };
}

// ---------- Gravacoes (so Meet Ayio) ----------
async function chamarMeetAyio(metodo, caminho, corpo, timeoutMs = 8000) {
  const r = await fetch(`${MA_URL}/api/v1${caminho}`, {
    method: metodo,
    headers: { 'x-api-key': MA_KEY, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(`Meet Ayio respondeu ${r.status}${j.error ? `: ${j.error}` : ''}`), { status: r.status });
  }
  return r.status === 204 ? true : r.json();
}

// ---------- Transcricao e ata (Meet Ayio) ----------
// { status, text, segments, minutes, error, ... } | null (sem transcricao)
const obterTranscricao = (id) => chamarMeetAyio('GET', `/recordings/${encodeURIComponent(id)}/transcript`);
// Pede (ou refaz, se falhou) a transcricao + ata. Assincrono: o resultado chega no webhook transcript.ready.
const pedirTranscricao = (id) => chamarMeetAyio('POST', `/recordings/${encodeURIComponent(id)}/transcript`);
// Refaz SO a ata (sincrono, ate ~2 min) com a lista de presenca real e o titulo da sessao.
const regerarAta = (id, { participantes, titulo, instrucoes } = {}) => chamarMeetAyio(
  'POST', `/recordings/${encodeURIComponent(id)}/minutes`,
  { participants: participantes, title: titulo, instructions: instrucoes }, 150_000
);

// { id, roomName, sizeBytes, durationSec, createdAt, expiresAt, downloadUrl (15 min) } | null
const obterGravacao = (id) => chamarMeetAyio('GET', `/recordings/${encodeURIComponent(id)}`);
const listarGravacoes = (room) => chamarMeetAyio('GET', `/recordings?room=${encodeURIComponent(room)}`);
// Exclusao antecipada (pedido do titular, LGPD). true | null (nao existe)
const apagarGravacao = (id) => chamarMeetAyio('DELETE', `/recordings/${encodeURIComponent(id)}`);

// Valida o header x-meetayio-signature ("t=<unix>,v1=<hmac>") com o corpo CRU da requisicao.
function verificarWebhook(corpoCru, header, segredo = process.env.MEET_AYIO_WEBHOOK_SECRET, toleranciaSeg = 300) {
  const crypto = require('crypto');
  if (!segredo) return false;
  const partes = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  const t = Number(partes.t);
  if (!t || !partes.v1 || Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(`${t}.${corpoCru}`).digest('hex');
  return partes.v1.length === esperado.length && crypto.timingSafeEqual(Buffer.from(partes.v1), Buffer.from(esperado));
}

module.exports = {
  PROVEDOR, configurado, gerarSala,
  obterGravacao, listarGravacoes, apagarGravacao, verificarWebhook,
  obterTranscricao, pedirTranscricao, regerarAta,
};
