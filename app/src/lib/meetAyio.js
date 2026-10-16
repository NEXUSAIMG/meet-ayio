// Cliente da meet-ayio-api (só no servidor: a chave nunca vai para o navegador).
const base = () => (process.env.MEET_AYIO_API_URL || '').replace(/\/$/, '');

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(base() + '/api/v1' + caminho, {
    method: metodo,
    headers: { 'x-api-key': process.env.MEET_AYIO_API_KEY || '', 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = new Error(json.error || `HTTP ${r.status}`);
    erro.status = r.status;
    erro.dados = json;
    throw erro;
  }
  return json;
}

// { token, roomName, domain, scriptUrl, recording: { allowed, reason? } }
export const emitirToken = ({ sala, nome, email, id, moderador }) =>
  chamar('POST', '/tokens', { room: sala, user: { name: nome, email: email || undefined, id: id || undefined }, moderator: Boolean(moderador) });

export const listarGravacoes = (sala) => chamar('GET', `/recordings?room=${encodeURIComponent(sala)}&limit=50`);
export const detalheGravacao = (id) => chamar('GET', `/recordings/${encodeURIComponent(id)}`);
export async function transcricao(id) {
  try { return await chamar('GET', `/recordings/${encodeURIComponent(id)}/transcript`); } catch (e) { if (e.status === 404) return null; throw e; }
}
export const pedirTranscricao = (id) => chamar('POST', `/recordings/${encodeURIComponent(id)}/transcript`);
export const apagarGravacao = (id) => chamar('DELETE', `/recordings/${encodeURIComponent(id)}`);
