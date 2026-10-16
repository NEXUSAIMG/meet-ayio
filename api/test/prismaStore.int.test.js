// Teste de integração do prismaStore contra um MySQL real.
// Só roda com TEST_DATABASE_URL (banco descartável; as tabelas são limpas).
//   npx prisma migrate deploy && node --test test/prismaStore.int.test.js
const test = require('node:test');
const assert = require('node:assert');

const url = process.env.TEST_DATABASE_URL;

test('prismaStore: contrato completo contra MySQL', { skip: !url && 'sem TEST_DATABASE_URL' }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const { criarPrismaStore } = require('../src/stores/prismaStore');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.transcript.deleteMany();
    await prisma.recording.deleteMany();
    await prisma.tokenIssue.deleteMany();
    await prisma.session.deleteMany();
    await prisma.client.deleteMany();
    const store = criarPrismaStore(prisma);

    const c = await store.createClient({
      slug: 'seucartorio', name: 'SeuCartório', roomPrefix: 'sc-', apiKeyHash: 'a'.repeat(64),
      webhookSecret: 'whsec_x', recordingRetentionDays: 30,
    });
    assert.strictEqual((await store.findClientByKeyHash('a'.repeat(64))).slug, 'seucartorio');
    assert.strictEqual((await store.getClientById(c.id)).webhookSecret, 'whsec_x');
    await assert.rejects(
      store.createClient({ slug: 'seucartorio', name: 'x', roomPrefix: 'xx-', apiKeyHash: 'b'.repeat(64) }),
      (e) => e.code === 'DUPLICADO'
    );

    await store.recordToken({ clientId: c.id, roomName: 'sc-sala-1', moderator: true, userName: 'Karina' });
    await store.recordToken({ clientId: c.id, roomName: 'sc-sala-1', moderator: false, userName: 'Davi' });
    const janela = [new Date(Date.now() - 3600_000), new Date(Date.now() + 1000)];
    assert.deepStrictEqual(await store.listParticipantNames('sc-sala-1', ...janela), ['Karina (moderador)', 'Davi']);
    assert.strictEqual(await store.clearTokenNamesBefore(new Date(Date.now() + 5000)), 2);
    assert.deepStrictEqual(await store.listParticipantNames('sc-sala-1', ...janela), []);
    await store.createSession({ roomName: 'sc-sala-2', clientId: c.id, title: 'Atendimento' });
    assert.strictEqual((await store.getSession('sc-sala-1')).clientId, c.id);

    // gravações
    const futuro = new Date(Date.now() + 86400000);
    const g1 = await store.createRecording({ clientId: c.id, roomName: 'sc-sala-1', storageKey: 'k1', sizeBytes: 5_000_000_000, durationSec: 600, expiresAt: futuro });
    const g2 = await store.createRecording({ clientId: c.id, roomName: 'sc-sala-2', storageKey: 'k2', sizeBytes: 1000, durationSec: 60, expiresAt: new Date(Date.now() - 1000) });
    assert.strictEqual(Number((await store.getRecording(g1.id)).sizeBytes), 5_000_000_000, 'BigInt > 4 GB');
    assert.deepStrictEqual((await store.listRecordings(c.id, { roomName: 'sc-sala-1' })).map((g) => g.id), [g1.id]);
    assert.deepStrictEqual((await store.listExpiredRecordings(new Date())).map((g) => g.id), [g2.id]);
    await store.updateRecording(g2.id, { status: 'DELETED', deletedAt: new Date(), webhookStatus: 'DELIVERED', webhookAttempts: 2 });
    assert.strictEqual((await store.listExpiredRecordings(new Date())).length, 0);
    assert.strictEqual((await store.listRecordings(c.id)).length, 1);
    assert.strictEqual(await store.updateRecording('nao-existe', { status: 'DELETED' }), null);

    // transcrições
    const tr = await store.createTranscript({ recordingId: g1.id, clientId: c.id });
    await assert.rejects(store.createTranscript({ recordingId: g1.id, clientId: c.id }), (e) => e.code === 'DUPLICADO');
    assert.strictEqual(tr.status, 'PENDING');
    const textoLongo = 'palavra '.repeat(200_000); // ~1,6 MB (LongText)
    const segs = [{ start: 1.5, end: 3, text: 'olá' }, { start: 61, end: 64, text: 'tudo bem' }];
    await store.updateTranscript(tr.id, { status: 'DONE', text: textoLongo, segments: segs, durationSec: 150, minutes: 'RASCUNHO', minutesModel: 'm' });
    const lida = await store.getTranscriptByRecording(g1.id);
    assert.deepStrictEqual([lida.text.length, lida.segments, lida.minutes], [textoLongo.length, segs, 'RASCUNHO']);

    // monitoramento e quotas
    assert.strictEqual(await store.ping(), true);
    assert.strictEqual(await store.storageBytes(c.id), 5_000_000_000, 'só gravações READY');
    await store.updateRecording(g1.id, { webhookStatus: 'FAILED' });
    assert.deepStrictEqual((await store.listRecordingsByWebhookStatus(['FAILED'])).map((g) => g.id), [g1.id]);
    assert.strictEqual((await store.listRecordingsByWebhookStatus(['FAILED'], { since: new Date(Date.now() + 60_000) })).length, 0);
    const g3 = await store.createRecording({ clientId: c.id, roomName: 'sc-sala-3', storageKey: 'k3', sizeBytes: 10, expiresAt: futuro });
    const tr3 = await store.createTranscript({ recordingId: g3.id, clientId: c.id });
    let st = await store.transcriptStats();
    assert.deepStrictEqual(st.byStatus, { PENDING: 1, PROCESSING: 0, DONE: 1, FAILED: 0 });
    assert.ok(st.oldestPendingAt instanceof Date);
    await store.updateTranscript(tr3.id, { status: 'FAILED', error: 'quota' });
    st = await store.transcriptStats();
    assert.strictEqual(st.oldestPendingAt, null);
    assert.deepStrictEqual((await store.listFailedTranscripts({ since: new Date(Date.now() - 60_000) })).map((t) => [t.id, t.error]), [[tr3.id, 'quota']]);
    await store.deleteTranscriptByRecording(g3.id);
    await store.updateRecording(g3.id, { status: 'DELETED' });
    const q = await store.updateClient('seucartorio', { quotaRecordedMinutes: 600, quotaStorageMb: null, quotaTranscribedMinutes: 0 });
    assert.deepStrictEqual([q.quotaRecordedMinutes, q.quotaStorageMb, q.quotaTranscribedMinutes], [600, null, 0]);
    assert.strictEqual((await store.getClientBySlug('seucartorio')).id, c.id);
    assert.strictEqual(await store.getClientBySlug('nao-existe'), null);
    assert.deepStrictEqual((await store.listTranscriptsByStatus(['DONE'])).map((t) => t.id), [tr.id]);
    assert.strictEqual((await store.listTranscriptsByStatus(['PENDING', 'PROCESSING'])).length, 0);

    const u = await store.usage(c.id, new Date(Date.now() - 86400000), new Date(Date.now() + 86400000));
    assert.strictEqual(u.transcribedMinutes, 3);
    await store.deleteTranscriptByRecording(g1.id);
    assert.strictEqual(await store.getTranscriptByRecording(g1.id), null);
    assert.deepStrictEqual(
      { s: u.sessions, t: u.tokens, m: u.moderatorTokens, g: u.recordings, min: u.recordedMinutes, b: u.recordedBytes, meses: u.byMonth.length },
      { s: 2, t: 2, m: 1, g: 3, min: 11, b: 5_000_001_010, meses: 1 }
    );
    assert.deepStrictEqual(
      { s: u.byMonth[0].sessions, t: u.byMonth[0].tokens, g: u.byMonth[0].recordings },
      { s: 2, t: 2, g: 3 }
    );

    const atualizado = await store.updateClient('seucartorio', { active: false, recordingRetentionDays: 90 });
    assert.deepStrictEqual([atualizado.active, atualizado.recordingRetentionDays], [false, 90]);
    assert.strictEqual(await store.updateClient('nao-existe', { active: false }), null);
    assert.strictEqual((await store.listClients()).length, 1);
  } finally {
    await prisma.$disconnect();
  }
});
