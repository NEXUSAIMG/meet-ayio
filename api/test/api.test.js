const test = require('node:test');
const assert = require('node:assert');
const { comServidor, req, post, lerJwt } = require('./helpers');

test('sem API key → 401', () => comServidor(async ({ base }) => {
  assert.strictEqual((await post(base, '/api/v1/sessions')).status, 401);
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: 'errada' })).status, 401);
}));

test('POST /tokens: sala do próprio cliente (fluxo do SeuCartório)', () => comServidor(async ({ base }) => {
  const r = await post(base, '/api/v1/tokens', {
    key: 'chave-sc', body: { room: 'sc-0123456789abcdef01234567', user: { id: 7, name: 'Karina' }, moderator: true },
  });
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.strictEqual(j.domain, 'meet.exemplo.com');
  assert.strictEqual(j.scriptUrl, 'https://meet.exemplo.com/external_api.js');
  const p = lerJwt(j.token);
  assert.strictEqual(p.room, 'sc-0123456789abcdef01234567');
  assert.strictEqual(p.sub, 'meet.jitsi');
  assert.strictEqual(p.context.user.name, 'Karina');
  assert.strictEqual(p.context.user.moderator, true);
  assert.strictEqual(p.context.features.recording, true, 'moderador pode gravar por padrão');
}));

test('POST /tokens: participante não grava; moderador pode ter gravação desligada', () => comServidor(async ({ base }) => {
  const corpo = (extra) => ({ key: 'chave-sc', body: { room: 'sc-sala-grav', user: { name: 'A' }, ...extra } });
  const part = await (await post(base, '/api/v1/tokens', corpo({}))).json();
  assert.strictEqual(lerJwt(part.token).context.features.recording, false);
  const mod = await (await post(base, '/api/v1/tokens', corpo({ moderator: true, features: { recording: false } }))).json();
  assert.strictEqual(lerJwt(mod.token).context.features.recording, false);
}));

test('POST /tokens: recusa sala sem o prefixo do cliente', () => comServidor(async ({ base }) => {
  const r = await post(base, '/api/v1/tokens', { key: 'chave-bot', body: { room: 'sc-abcdefgh', user: { name: 'X' } } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).roomPrefix, 'bot-');
}));

test('POST /tokens: exige user.name; JSON inválido → 400', () => comServidor(async ({ base }) => {
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: 'chave-sc', body: { room: 'sc-abcdefgh' } })).status, 400);
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: 'chave-sc', raw: '{quebrado', headers: { 'content-type': 'application/json' } })).status, 400);
}));

test('sessions: cria sala com prefixo e emite token; outro cliente não acessa', () => comServidor(async ({ base }) => {
  const r1 = await post(base, '/api/v1/sessions', { key: 'chave-sc', body: { prefix: 'Atendimento' } });
  assert.strictEqual(r1.status, 201);
  const { roomName, url } = await r1.json();
  assert.match(roomName, /^sc-atendimento-[0-9a-f]{12}$/);
  assert.strictEqual(url, `https://meet.exemplo.com/${roomName}`);
  const r2 = await post(base, `/api/v1/sessions/${roomName}/token`, { key: 'chave-sc', body: { user: { name: 'Davi' } } });
  assert.strictEqual(lerJwt((await r2.json()).token).context.user.moderator, false);
  const r3 = await post(base, `/api/v1/sessions/${roomName}/token`, { key: 'chave-bot', body: { user: { name: 'X' } } });
  assert.strictEqual(r3.status, 400); // prefixo de outro cliente
}));

test('usage conta sessões e tokens do cliente', () => comServidor(async ({ base }) => {
  for (const m of [true, false, false]) {
    await post(base, '/api/v1/tokens', { key: 'chave-sc', body: { room: 'sc-sala-uso-1', user: { name: 'A' }, moderator: m } });
  }
  await post(base, '/api/v1/tokens', { key: 'chave-bot', body: { room: 'bot-outra', user: { name: 'B' } } });
  const u = await (await req(base, 'GET', '/api/v1/usage', { key: 'chave-sc' })).json();
  assert.strictEqual(u.client, 'seucartorio');
  assert.strictEqual(u.sessions, 1);
  assert.strictEqual(u.tokens, 3);
  assert.strictEqual(u.moderatorTokens, 1);
  assert.strictEqual(u.recordings, 0);
  assert.strictEqual(u.byMonth.length, 1);
}));

test('admin: cria cliente, chave funciona, rotação invalida a antiga, desativar bloqueia', () => comServidor(async ({ base }) => {
  assert.strictEqual((await req(base, 'GET', '/admin/clients')).status, 401);
  const r = await post(base, '/admin/clients', { admin: 'admin-teste', body: { slug: 'gestaonexus', name: 'GestaoNexus', roomPrefix: 'gn-' } });
  assert.strictEqual(r.status, 201);
  const c = await r.json();
  assert.match(c.apiKey, /^mak_/);
  assert.match(c.webhookSecret, /^whsec_/);
  assert.strictEqual(c.apiKeyHash, undefined);
  assert.strictEqual(c.recordingRetentionDays, 30);
  const lista = await (await req(base, 'GET', '/admin/clients', { admin: 'admin-teste' })).json();
  assert.ok(lista.every((x) => x.webhookSecret === undefined && x.apiKeyHash === undefined), 'lista não vaza segredos');

  const corpo = { room: 'gn-sala-teste', user: { name: 'Z' } };
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: c.apiKey, body: corpo })).status, 200);
  assert.strictEqual((await post(base, '/admin/clients', { admin: 'admin-teste', body: { slug: 'gestaonexus' } })).status, 409);

  const nova = (await (await post(base, '/admin/clients/gestaonexus/rotate-key', { admin: 'admin-teste' })).json()).apiKey;
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: c.apiKey, body: corpo })).status, 401);
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: nova, body: corpo })).status, 200);

  const p = await req(base, 'PATCH', '/admin/clients/gestaonexus', { admin: 'admin-teste', body: { recordingRetentionDays: 0 } });
  assert.strictEqual(p.status, 400);
  await req(base, 'PATCH', '/admin/clients/gestaonexus', { admin: 'admin-teste', body: { active: false } });
  assert.strictEqual((await post(base, '/api/v1/tokens', { key: nova, body: corpo })).status, 401);
}));

test('rota desconhecida → 404 JSON', () => comServidor(async ({ base }) => {
  const r = await post(base, '/api/v1/sessions/sc-abcdefgh/recording/start', { key: 'chave-sc' });
  assert.strictEqual(r.status, 404);
}));
