const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { comServidor, req, post, lerJwt, receptorWebhook } = require('./helpers');
const { situacaoQuotas, lerQuotas } = require('../src/quotas');
const { criarMemoryStore } = require('../src/stores/memoryStore');

const ADMIN = { admin: 'admin-teste' };
const VIDEO = crypto.randomBytes(64 * 1024);
const patch = (base, p, body) => req(base, 'PATCH', p, { ...ADMIN, body });
const get = (base, p) => req(base, 'GET', p, ADMIN);
const enviarGravacao = (base, sala, duracao = 120, corpo = VIDEO) => req(base, 'PUT', `/internal/recordings?room=${sala}&durationSec=${duracao}`, {
  bearer: 'recorder-teste', raw: corpo, headers: { 'content-type': 'video/mp4' },
});
const tokenModerador = async (base, key, room) => (await post(base, '/api/v1/tokens', {
  key, body: { room, user: { name: 'Moderadora' }, moderator: true },
})).json();

// ---------- Painel ----------
test('painel: página abre sem token, com CSP; dados exigem ADMIN_TOKEN', () => comServidor(async ({ base }) => {
  const r = await fetch(base + '/admin/painel');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await r.text();
  assert.match(html, /Meet Ayio · Admin/);
  assert.doesNotMatch(html, /admin-teste/, 'não embute o token');
  const raiz = await fetch(base + '/admin', { redirect: 'manual' });
  assert.strictEqual(raiz.status, 302);
  assert.strictEqual((await fetch(base + '/admin/health')).status, 401);
  assert.strictEqual((await fetch(base + '/admin/usage')).status, 401);
  assert.strictEqual((await req(base, 'GET', '/admin/clients', { admin: 'errado' })).status, 401);
}));

// ---------- Saúde ----------
test('saúde: /health/ready público e /admin/health completo', () => comServidor(async ({ base }) => {
  assert.deepStrictEqual(await (await fetch(base + '/health/ready')).json(), { ok: true });
  const s = await (await get(base, '/admin/health')).json();
  assert.strictEqual(s.status, 'ok');
  assert.deepStrictEqual(s.problems, []);
  assert.strictEqual(s.database.ok, true);
  assert.strictEqual(s.storage.type, 'local');
  assert.strictEqual(s.transcription.configured, false);
  assert.deepStrictEqual(s.transcription.byStatus, { PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0 });
  assert.deepStrictEqual(s.transcription.process, { waiting: 0, processing: null });
  assert.strictEqual(s.webhooks.process.failed, 0);
  assert.ok(s.version);
}));

test('saúde: banco fora → 503 em /health/ready e status down', () => comServidor(async ({ base, store }) => {
  store.ping = async () => { throw new Error('ECONNREFUSED'); };
  assert.strictEqual((await fetch(base + '/health/ready')).status, 503);
  const r = await get(base, '/admin/health');
  assert.strictEqual(r.status, 503);
  const s = await r.json();
  assert.strictEqual(s.status, 'down');
  assert.match(s.database.error, /ECONNREFUSED/);
}));

test('saúde: webhook que desistiu e transcrição que falhou aparecem; reenviar pelo admin', () => comServidor(async ({ base, notificador, fila }) => {
  const hook = await receptorWebhook({ falhasIniciais: 2 }); // delaysMs = [0]: 1 tentativa só → falha
  try {
    const c = await (await post(base, '/admin/clients', { ...ADMIN, body: { slug: 'hookfalho', roomPrefix: 'hf-', webhookUrl: hook.url, transcriptionEnabled: true } })).json();
    await tokenModerador(base, c.apiKey, 'hf-sala-0001');
    const { id } = await (await enviarGravacao(base, 'hf-sala-0001')).json();
    await notificador.aguardar();
    await fila.aguardar(); // transcrição falha: TRANSCRIBE_API_KEY não configurada
    await notificador.aguardar();

    const s = await (await get(base, '/admin/health')).json();
    assert.strictEqual(s.status, 'degraded');
    assert.deepStrictEqual(s.webhooks.recordingsFailed.map((g) => g.id), [id]);
    assert.strictEqual(s.webhooks.process.failed, 2, 'recording.ready e transcript.failed');
    assert.deepStrictEqual(s.webhooks.recentFailures.map((f) => f.event).sort(), ['recording.ready', 'transcript.failed']);
    assert.strictEqual(s.transcription.byStatus.FAILED, 1);
    assert.match(s.transcription.recentFailures[0].error, /TRANSCRIBE_API_KEY/);
    assert.ok(s.problems.some((p) => /sem webhook entregue/.test(p)));
    assert.ok(s.problems.some((p) => /transcrição\(ões\) falharam/.test(p)));

    // o receptor volta: reenviar pelo admin entrega
    assert.strictEqual((await post(base, `/admin/recordings/${id}/webhook`, ADMIN)).status, 202);
    await notificador.aguardar();
    const lista = await (await get(base, '/admin/clients/hookfalho/recordings')).json();
    assert.strictEqual(lista[0].webhookStatus, 'DELIVERED');
    assert.strictEqual(lista[0].transcript.status, 'FAILED');
  } finally {
    await hook.fechar();
  }
}));

// ---------- Quotas ----------
test('lerQuotas: aceita inteiro >= 0 ou null; recusa o resto', () => {
  assert.deepStrictEqual(lerQuotas({ quotaRecordedMinutes: 600, quotaStorageMb: null, quotaTranscribedMinutes: '' }).dados,
    { quotaRecordedMinutes: 600, quotaStorageMb: null, quotaTranscribedMinutes: null });
  assert.strictEqual(lerQuotas({ quotaRecordedMinutes: -1 }).erro, 'quotaRecordedMinutes');
  assert.strictEqual(lerQuotas({ quotaStorageMb: 1.5 }).erro, 'quotaStorageMb');
  assert.deepStrictEqual(lerQuotas({ name: 'x' }).dados, {});
});

test('quotas: sem limite (padrão) não consulta o banco', async () => {
  const store = criarMemoryStore();
  store.usage = () => { throw new Error('não devia consultar'); };
  const q = await situacaoQuotas(store, { id: 'x' });
  assert.strictEqual(q.recordingAllowed, true);
  assert.strictEqual(q.transcriptionAllowed, true);
  assert.deepStrictEqual(q.limits, { recordedMinutes: null, transcribedMinutes: null, storageMb: null });
});

test('quotas: minutos gravados no mês tiram o botão de gravar; admin vê no /usage', () => comServidor(async ({ base }) => {
  const c = await (await post(base, '/admin/clients', { ...ADMIN, body: { slug: 'quotagrav', roomPrefix: 'qg-', quotaRecordedMinutes: 3 } })).json();
  assert.strictEqual(c.quotaRecordedMinutes, 3);
  let t = await tokenModerador(base, c.apiKey, 'qg-sala-0001');
  assert.deepStrictEqual(t.recording, { allowed: true });
  assert.strictEqual(lerJwt(t.token).context.features.recording, true);

  await enviarGravacao(base, 'qg-sala-0001', 125); // 2 min
  t = await tokenModerador(base, c.apiKey, 'qg-sala-0001');
  assert.strictEqual(t.recording.allowed, true, '2 de 3 min: ainda pode');

  await enviarGravacao(base, 'qg-sala-0001', 70); // total 3 min
  t = await tokenModerador(base, c.apiKey, 'qg-sala-0001');
  assert.deepStrictEqual(t.recording, { allowed: false, reason: 'quota_excedida', exceeded: ['recordedMinutes'] });
  assert.strictEqual(lerJwt(t.token).context.features.recording, false);
  assert.strictEqual(lerJwt(t.token).context.user.moderator, true, 'continua moderador');

  const uso = await (await req(base, 'GET', '/api/v1/usage', { key: c.apiKey })).json();
  assert.deepStrictEqual(uso.quota.exceeded, ['recordedMinutes']);
  assert.strictEqual(uso.quota.used.recordedMinutes, 3);

  const adm = await (await get(base, '/admin/usage')).json();
  const linha = adm.clients.find((x) => x.slug === 'quotagrav');
  assert.strictEqual(linha.recordings, 2);
  assert.strictEqual(linha.quota.recordingAllowed, false);
  assert.strictEqual(adm.clients.find((x) => x.slug === 'seucartorio').quota.recordingAllowed, true);

  // admin sobe a quota (ou tira: null) → volta a gravar
  assert.strictEqual((await patch(base, '/admin/clients/quotagrav', { quotaRecordedMinutes: null })).status, 200);
  t = await tokenModerador(base, c.apiKey, 'qg-sala-0001');
  assert.deepStrictEqual(t.recording, { allowed: true });

  assert.strictEqual((await patch(base, '/admin/clients/quotagrav', { quotaStorageMb: -5 })).status, 400);
  assert.strictEqual((await get(base, '/admin/usage?month=2026-13')).status, 400);
  const passado = await (await get(base, '/admin/usage?month=2025-01')).json();
  assert.strictEqual(passado.clients.find((x) => x.slug === 'quotagrav').recordings, 0);
  assert.strictEqual(passado.clients[0].quota, null, 'quota só no mês corrente');
}));

test('quotas: espaço ocupado também bloqueia gravar', () => comServidor(async ({ base }) => {
  const c = await (await post(base, '/admin/clients', { ...ADMIN, body: { slug: 'quotaesp', roomPrefix: 'qe-', quotaStorageMb: 1 } })).json();
  await tokenModerador(base, c.apiKey, 'qe-sala-0001');
  await enviarGravacao(base, 'qe-sala-0001', 60, crypto.randomBytes(1_100_000));
  const t = await tokenModerador(base, c.apiKey, 'qe-sala-0001');
  assert.deepStrictEqual(t.recording.exceeded, ['storageMb']);
}));

test('quotas: transcrição do mês atingida → upload aceita a gravação mas recusa transcrever', () => comServidor(async ({ base, store, notificador, fila }) => {
  const hook = await receptorWebhook();
  try {
    const c = await (await post(base, '/admin/clients', {
      ...ADMIN, body: { slug: 'quotatr', roomPrefix: 'qt-', transcriptionEnabled: true, quotaTranscribedMinutes: 0, webhookUrl: hook.url },
    })).json();
    await tokenModerador(base, c.apiKey, 'qt-sala-0001');
    const up = await enviarGravacao(base, 'qt-sala-0001');
    assert.strictEqual(up.status, 201);
    const { id, transcription } = await up.json();
    assert.strictEqual(transcription, 'QUOTA_EXCEEDED');
    await notificador.aguardar();
    const eventos = hook.recebidos.map((r) => JSON.parse(r.corpo));
    const falha = eventos.find((e) => e.event === 'transcript.failed');
    assert.ok(falha, 'cliente é avisado');
    assert.match(falha.data.error, /quota mensal de transcrição/);

    // pedido manual do cliente também é recusado (429)...
    const r = await post(base, `/api/v1/recordings/${id}/transcript`, { key: c.apiKey });
    assert.strictEqual(r.status, 429);
    assert.strictEqual((await r.json()).error, 'quota_excedida');
    // ...mas o admin pode passar por cima
    assert.strictEqual((await post(base, `/admin/recordings/${id}/transcript`, ADMIN)).status, 202);
    await fila.aguardar();
    assert.strictEqual((await store.getTranscriptByRecording(id)).status, 'FAILED', 'sem TRANSCRIBE_API_KEY no teste');
    assert.match((await store.getTranscriptByRecording(id)).error, /não configurada/);
  } finally {
    await hook.fechar();
  }
}));

// ---------- Ações do admin nas gravações ----------
test('admin: listar, baixar, ver ata e apagar gravação de qualquer cliente', () => comServidor(async ({ base, store }) => {
  await tokenModerador(base, 'chave-sc', 'sc-sala-admin-01');
  const { id } = await (await enviarGravacao(base, 'sc-sala-admin-01')).json();
  const lista = await (await get(base, '/admin/clients/seucartorio/recordings')).json();
  assert.deepStrictEqual(lista.map((g) => [g.id, g.transcript]), [[id, null]]);
  assert.strictEqual((await get(base, '/admin/clients/naoexiste/recordings')).status, 404);

  const { downloadUrl } = await (await get(base, `/admin/recordings/${id}/download`)).json();
  const arq = await fetch(downloadUrl);
  assert.strictEqual(Buffer.from(await arq.arrayBuffer()).length, VIDEO.length);

  assert.strictEqual((await get(base, `/admin/recordings/${id}/transcript`)).status, 404);
  const tr = await store.createTranscript({ recordingId: id, clientId: (await store.getClientBySlug('seucartorio')).id });
  await store.updateTranscript(tr.id, { status: 'DONE', text: 'olá', minutes: 'ATA' });
  assert.strictEqual((await (await get(base, `/admin/recordings/${id}/transcript`)).json()).minutes, 'ATA');

  assert.strictEqual((await req(base, 'DELETE', `/admin/recordings/${id}`, ADMIN)).status, 204);
  assert.strictEqual((await get(base, `/admin/recordings/${id}/download`)).status, 404);
  assert.strictEqual(await store.getTranscriptByRecording(id), null);
  assert.deepStrictEqual(await (await get(base, '/admin/clients/seucartorio/recordings')).json(), []);
}));

test('admin: detalhe do cliente e teste de webhook', () => comServidor(async ({ base }) => {
  const hook = await receptorWebhook();
  try {
    const c = await (await get(base, '/admin/clients/seucartorio')).json();
    assert.strictEqual(c.roomPrefix, 'sc-');
    assert.strictEqual(c.apiKeyHash, undefined, 'não expõe o hash');
    assert.strictEqual((await post(base, '/admin/clients/seucartorio/webhook-test', ADMIN)).status, 409);
    await patch(base, '/admin/clients/seucartorio', { webhookUrl: hook.url });
    const r = await (await post(base, '/admin/clients/seucartorio/webhook-test', ADMIN)).json();
    assert.strictEqual(r.delivered, true);
    assert.strictEqual(JSON.parse(hook.recebidos[0].corpo).event, 'ping');
  } finally {
    await hook.fechar();
  }
}));
