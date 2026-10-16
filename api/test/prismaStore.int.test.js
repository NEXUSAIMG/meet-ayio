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
    await prisma.tokenIssue.deleteMany();
    await prisma.session.deleteMany();
    await prisma.client.deleteMany();
    const store = criarPrismaStore(prisma);

    const c = await store.createClient({ slug: 'seucartorio', name: 'SeuCartório', roomPrefix: 'sc-', apiKeyHash: 'a'.repeat(64) });
    assert.strictEqual((await store.findClientByKeyHash('a'.repeat(64))).slug, 'seucartorio');
    await assert.rejects(
      store.createClient({ slug: 'seucartorio', name: 'x', roomPrefix: 'xx-', apiKeyHash: 'b'.repeat(64) }),
      (e) => e.code === 'DUPLICADO'
    );

    await store.recordToken({ clientId: c.id, roomName: 'sc-sala-1', moderator: true });
    await store.recordToken({ clientId: c.id, roomName: 'sc-sala-1', moderator: false });
    await store.createSession({ roomName: 'sc-sala-2', clientId: c.id, title: 'Atendimento' });
    assert.strictEqual((await store.getSession('sc-sala-1')).clientId, c.id);

    const u = await store.usage(c.id, new Date(Date.now() - 86400000), new Date(Date.now() + 86400000));
    assert.deepStrictEqual(
      { sessions: u.sessions, tokens: u.tokens, moderatorTokens: u.moderatorTokens, meses: u.byMonth.length },
      { sessions: 2, tokens: 2, moderatorTokens: 1, meses: 1 }
    );
    assert.deepStrictEqual({ s: u.byMonth[0].sessions, t: u.byMonth[0].tokens }, { s: 2, t: 2 });

    const atualizado = await store.updateClient('seucartorio', { active: false });
    assert.strictEqual(atualizado.active, false);
    assert.strictEqual(await store.updateClient('nao-existe', { active: false }), null);
    assert.strictEqual((await store.listClients()).length, 1);
  } finally {
    await prisma.$disconnect();
  }
});
