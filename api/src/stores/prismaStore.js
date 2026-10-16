// Store de produção (Prisma + MySQL). Mesma interface do memoryStore.
function criarPrismaStore(prisma) {
  const store = {
    findClientByKeyHash: (hash) => prisma.client.findUnique({ where: { apiKeyHash: hash } }),

    async createClient(dados) {
      try {
        return await prisma.client.create({ data: dados });
      } catch (e) {
        if (e.code === 'P2002') throw Object.assign(new Error('slug ou prefixo já existe'), { code: 'DUPLICADO' });
        throw e;
      }
    },

    listClients: () => prisma.client.findMany({ orderBy: { createdAt: 'asc' } }),

    async updateClient(slug, dados) {
      const r = await prisma.client.updateMany({ where: { slug }, data: dados });
      return r.count ? prisma.client.findUnique({ where: { slug } }) : null;
    },

    createSession: ({ roomName, clientId, title = null }) =>
      prisma.session.create({ data: { roomName, clientId, title } }),

    getSession: (roomName) => prisma.session.findUnique({ where: { roomName } }),

    async recordToken({ clientId, roomName, moderator }) {
      await prisma.session.upsert({ where: { roomName }, create: { roomName, clientId }, update: {} });
      await prisma.tokenIssue.create({ data: { clientId, roomName, moderator: Boolean(moderator) } });
    },

    async usage(clientId, de, ate) {
      const filtro = { clientId, createdAt: { gte: de, lt: ate } };
      const [sessions, tokens, moderatorTokens, sMes, tMes] = await Promise.all([
        prisma.session.count({ where: filtro }),
        prisma.tokenIssue.count({ where: filtro }),
        prisma.tokenIssue.count({ where: { ...filtro, moderator: true } }),
        prisma.$queryRaw`SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n FROM sessions
          WHERE client_id = ${clientId} AND created_at >= ${de} AND created_at < ${ate} GROUP BY m`,
        prisma.$queryRaw`SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n FROM token_issues
          WHERE client_id = ${clientId} AND created_at >= ${de} AND created_at < ${ate} GROUP BY m`,
      ]);
      const porMes = new Map();
      const linha = (m) => porMes.get(m) || porMes.set(m, { month: m, sessions: 0, tokens: 0 }).get(m);
      sMes.forEach((r) => { linha(r.m).sessions = Number(r.n); });
      tMes.forEach((r) => { linha(r.m).tokens = Number(r.n); });
      return {
        sessions, tokens, moderatorTokens,
        byMonth: [...porMes.values()].sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };
  return store;
}

module.exports = { criarPrismaStore };
