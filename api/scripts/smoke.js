// Smoke test contra uma API rodando: cria cliente (admin), emite token, lê /usage.
// Uso: API_URL=http://localhost:3000 ADMIN_TOKEN=... node scripts/smoke.js
const base = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const admin = process.env.ADMIN_TOKEN;

async function chamar(metodo, path, { headers = {}, body } = {}) {
  const r = await fetch(base + path, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

(async () => {
  console.log('health:', await chamar('GET', '/health'));
  const slug = `smoke-${Date.now().toString(36)}`;
  const cliente = await chamar('POST', '/admin/clients', {
    headers: { authorization: `Bearer ${admin}` },
    body: { slug, name: 'Smoke test', roomPrefix: `${slug.slice(-6)}-` },
  });
  console.log('cliente criado:', cliente.slug, 'prefixo', cliente.roomPrefix);
  const key = { 'x-api-key': cliente.apiKey };
  const t = await chamar('POST', '/api/v1/tokens', {
    headers: key, body: { room: `${cliente.roomPrefix}sala-teste`, user: { name: 'Smoke' }, moderator: true },
  });
  console.log('token ok:', t.roomName, t.domain, `${t.token.slice(0, 20)}…`);
  const u = await chamar('GET', '/api/v1/usage', { headers: key });
  console.log('usage:', { sessions: u.sessions, tokens: u.tokens });
  await chamar('PATCH', `/admin/clients/${slug}`, { headers: { authorization: `Bearer ${admin}` }, body: { active: false } });
  console.log('cliente de smoke desativado. OK');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
