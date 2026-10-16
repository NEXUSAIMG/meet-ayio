const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { comServidor, req, post, receptorWebhook } = require('./helpers');
const { verificarAssinatura } = require('../src/webhooks');
const { executarRetencao } = require('../src/retention');

const SALA = 'sc-0123456789abcdef01234567';
const VIDEO = crypto.randomBytes(256 * 1024); // "mp4" de 256 KB

// Cliente com webhook e segredo, e uma sala já usada (token emitido).
async function preparar(base, webhookUrl) {
  const c = await (await post(base, '/admin/clients', {
    admin: 'admin-teste', body: { slug: 'cartorio2', roomPrefix: 'c2-', webhookUrl, recordingRetentionDays: 7 },
  })).json();
  await post(base, '/api/v1/tokens', { key: c.apiKey, body: { room: 'c2-sala-gravada', user: { name: 'Mod' }, moderator: true } });
  return c;
}
const enviarGravacao = (base, sala, { segredo = 'recorder-teste', corpo = VIDEO, duracao = 125 } = {}) =>
  req(base, 'PUT', `/internal/recordings?room=${sala}&durationSec=${duracao}`, {
    bearer: segredo, raw: corpo, headers: { 'content-type': 'video/mp4' },
  });

test('upload do Jibri exige RECORDER_SECRET e sala conhecida', () => comServidor(async ({ base }) => {
  assert.strictEqual((await enviarGravacao(base, SALA, { segredo: 'errado' })).status, 401);
  assert.strictEqual((await enviarGravacao(base, 'sc-nunca-usada')).status, 404);
  await post(base, '/api/v1/tokens', { key: 'chave-sc', body: { room: SALA, user: { name: 'A' } } });
  assert.strictEqual((await enviarGravacao(base, SALA, { corpo: Buffer.alloc(0) })).status, 400);
}));

test('gravação: upload → webhook assinado → listar → baixar → apagar', () => comServidor(async ({ base, notificador }) => {
  const hook = await receptorWebhook();
  try {
    const c = await preparar(base, hook.url);
    const up = await enviarGravacao(base, 'c2-sala-gravada');
    assert.strictEqual(up.status, 201);
    const { id, sizeBytes } = await up.json();
    assert.strictEqual(sizeBytes, VIDEO.length);

    await notificador.aguardar();
    assert.strictEqual(hook.recebidos.length, 1);
    const { headers, corpo } = hook.recebidos[0];
    assert.strictEqual(headers['x-meetayio-event'], 'recording.ready');
    assert.ok(verificarAssinatura(c.webhookSecret, corpo, headers['x-meetayio-signature']), 'assinatura válida');
    assert.ok(!verificarAssinatura('outro-segredo', corpo, headers['x-meetayio-signature']), 'assinatura falha com segredo errado');
    const evento = JSON.parse(corpo);
    assert.strictEqual(evento.data.id, id);
    assert.strictEqual(evento.data.roomName, 'c2-sala-gravada');
    assert.strictEqual(evento.data.durationSec, 125);
    assert.strictEqual(evento.data.storageKey, undefined, 'não vaza caminho interno');

    const lista = await (await req(base, 'GET', '/api/v1/recordings?room=c2-sala-gravada', { key: c.apiKey })).json();
    assert.deepStrictEqual(lista.map((g) => [g.id, g.webhookStatus]), [[id, 'DELIVERED']]);
    const dias = (new Date(lista[0].expiresAt) - new Date(lista[0].createdAt)) / 86400000;
    assert.ok(Math.abs(dias - 7) < 0.01, 'retenção do cliente (7 dias)');

    // outro cliente não vê
    assert.strictEqual((await req(base, 'GET', `/api/v1/recordings/${id}`, { key: 'chave-sc' })).status, 404);

    const det = await (await req(base, 'GET', `/api/v1/recordings/${id}`, { key: c.apiKey })).json();
    const dl = await fetch(det.downloadUrl);
    assert.strictEqual(dl.status, 200);
    assert.match(dl.headers.get('content-disposition'), /attachment; filename="c2-sala-gravada-\d{8}-\d{4}\.mp4"/);
    assert.ok(Buffer.from(await dl.arrayBuffer()).equals(VIDEO), 'arquivo íntegro');
    assert.strictEqual((await fetch(det.downloadUrl.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')))).status, 403, 'link adulterado');

    const u = await (await req(base, 'GET', '/api/v1/usage', { key: c.apiKey })).json();
    assert.deepStrictEqual([u.recordings, u.recordedMinutes, u.recordedBytes], [1, 2, VIDEO.length]);

    assert.strictEqual((await req(base, 'DELETE', `/api/v1/recordings/${id}`, { key: c.apiKey })).status, 204);
    assert.strictEqual((await fetch(det.downloadUrl)).status, 404, 'arquivo removido do storage');
    assert.strictEqual((await req(base, 'GET', `/api/v1/recordings/${id}`, { key: c.apiKey })).status, 404);
  } finally {
    await hook.fechar();
  }
}));

test('webhook: retenta até entregar; marca FAILED se nunca entregar', () => comServidor(async ({ base, store, notificador }) => {
  const hook = await receptorWebhook({ falhasIniciais: 2 });
  try {
    const c = await preparar(base, hook.url);
    const { id } = await (await enviarGravacao(base, 'c2-sala-gravada')).json();
    await notificador.aguardar();
    assert.strictEqual(hook.recebidos.length, 3);
    const g = await store.getRecording(id);
    assert.deepStrictEqual([g.webhookStatus, g.webhookAttempts], ['DELIVERED', 3]);

    await req(base, 'PATCH', '/admin/clients/cartorio2', { admin: 'admin-teste', body: { webhookUrl: 'http://127.0.0.1:1/fora' } });
    const { id: id2 } = await (await enviarGravacao(base, 'c2-sala-gravada')).json();
    await notificador.aguardar();
    const g2 = await store.getRecording(id2);
    assert.deepStrictEqual([g2.webhookStatus, g2.webhookAttempts], ['FAILED', 3]);

    // reenvio manual depois que o endpoint volta
    await req(base, 'PATCH', '/admin/clients/cartorio2', { admin: 'admin-teste', body: { webhookUrl: hook.url } });
    assert.strictEqual((await post(base, `/api/v1/recordings/${id2}/webhook`, { key: c.apiKey })).status, 202);
    await notificador.aguardar();
    assert.strictEqual((await store.getRecording(id2)).webhookStatus, 'DELIVERED');

    const ping = await (await post(base, '/api/v1/webhooks/test', { key: c.apiKey })).json();
    assert.strictEqual(ping.delivered, true);
    assert.strictEqual(hook.recebidos.at(-1).headers['x-meetayio-event'], 'ping');
  } finally {
    await hook.fechar();
  }
}, { delaysMs: [0, 5, 5] }));

test('cliente sem webhookUrl: gravação fica com webhookStatus NONE', () => comServidor(async ({ base, store, notificador }) => {
  await post(base, '/api/v1/tokens', { key: 'chave-sc', body: { room: SALA, user: { name: 'A' } } });
  const { id } = await (await enviarGravacao(base, SALA)).json();
  await notificador.aguardar();
  assert.strictEqual((await store.getRecording(id)).webhookStatus, 'NONE');
}));

test('retenção apaga só as vencidas (arquivo e registro) e avisa recording.deleted', async () => {
  const hook = await receptorWebhook();
  try {
    await comServidor(async ({ base, store, storage, notificador }) => {
      const c = await preparar(base, hook.url);
      const { id: velha } = await (await enviarGravacao(base, 'c2-sala-gravada')).json();
      const { id: nova } = await (await enviarGravacao(base, 'c2-sala-gravada')).json();
      await store.updateRecording(velha, { expiresAt: new Date(Date.now() - 1000) });
      const chaveVelha = (await store.getRecording(velha)).storageKey;

      assert.strictEqual(await executarRetencao({ store, storage, notificador }), 1);
      assert.strictEqual((await store.getRecording(velha)).status, 'DELETED');
      assert.strictEqual((await store.getRecording(nova)).status, 'READY');
      await assert.rejects(storage.abrir(chaveVelha));
      assert.strictEqual(await executarRetencao({ store, storage, notificador }), 0, 'idempotente');

      // pedido do titular
      assert.strictEqual((await req(base, 'DELETE', `/api/v1/recordings/${nova}`, { key: c.apiKey })).status, 204);
      await notificador.aguardar();
      const apagadas = hook.recebidos.filter((r) => r.headers['x-meetayio-event'] === 'recording.deleted').map((r) => JSON.parse(r.corpo).data);
      assert.deepStrictEqual(apagadas.map((d) => [d.id, d.reason]), [[velha, 'retention'], [nova, 'request']]);
      assert.ok(verificarAssinatura(c.webhookSecret, hook.recebidos.at(-1).corpo, hook.recebidos.at(-1).headers['x-meetayio-signature']));
    });
  } finally {
    await hook.fechar();
  }
});
