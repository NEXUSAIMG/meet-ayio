const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { carregarConfig } = require('../src/config');
const { criarApp } = require('../src/app');

const cfg = carregarConfig({
  JWT_APP_ID: 'meet-ayio',
  JWT_APP_SECRET: 'segredo-de-teste',
  JITSI_PUBLIC_URL: 'https://meet.exemplo.com/',
  MEET_AYIO_API_KEYS: 'seucartorio:chave-sc,botayio:chave-bot',
});

async function comServidor(fn) {
  const srv = criarApp(cfg).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}

const post = (base, path, key, body) => fetch(base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
  body: JSON.stringify(body || {}),
});

test('sem API key → 401', () => comServidor(async (base) => {
  assert.strictEqual((await post(base, '/api/v1/sessions')).status, 401);
}));

test('cria sala e emite JWT válido para o prosody', () => comServidor(async (base) => {
  const r1 = await post(base, '/api/v1/sessions', 'chave-sc', { prefix: 'Atendimento' });
  assert.strictEqual(r1.status, 201);
  const { roomName, url } = await r1.json();
  assert.match(roomName, /^seucartorio-atendimento-[0-9a-f]{12}$/);
  assert.strictEqual(url, `https://meet.exemplo.com/${roomName}`);

  const r2 = await post(base, `/api/v1/sessions/${roomName}/token`, 'chave-sc',
    { user: { id: 7, name: 'Karina' }, moderator: true });
  assert.strictEqual(r2.status, 200);
  const { token } = await r2.json();
  const p = jwt.verify(token, 'segredo-de-teste', { algorithms: ['HS256'], audience: 'meet-ayio', issuer: 'meet-ayio' });
  assert.strictEqual(p.room, roomName);
  assert.strictEqual(p.sub, 'meet.jitsi');
  assert.strictEqual(p.context.user.name, 'Karina');
  assert.strictEqual(p.context.user.moderator, true);
}));

test('cliente não acessa sala de outro cliente', () => comServidor(async (base) => {
  const { roomName } = await (await post(base, '/api/v1/sessions', 'chave-sc')).json();
  const r = await post(base, `/api/v1/sessions/${roomName}/token`, 'chave-bot', { user: { name: 'X' } });
  assert.strictEqual(r.status, 404);
}));

test('gravação ainda responde 501', () => comServidor(async (base) => {
  const { roomName } = await (await post(base, '/api/v1/sessions', 'chave-sc')).json();
  assert.strictEqual((await post(base, `/api/v1/sessions/${roomName}/recording/start`, 'chave-sc')).status, 501);
}));
