const { nomesDistintos } = require('./comum');

// Store de produção (Prisma + MySQL). Mesma interface do memoryStore.
function criarPrismaStore(prisma) {
  const store = {
    findClientByKeyHash: (hash) => prisma.client.findUnique({ where: { apiKeyHash: hash } }),
    getClientById: (id) => prisma.client.findUnique({ where: { id } }),

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

    async recordToken({ clientId, roomName, moderator, userName = null }) {
      await prisma.session.upsert({ where: { roomName }, create: { roomName, clientId }, update: {} });
      await prisma.tokenIssue.create({ data: { clientId, roomName, moderator: Boolean(moderator), userName } });
    },

    // Nomes distintos de quem recebeu token para a sala no período, na ordem de chegada.
    async listParticipantNames(roomName, de, ate) {
      const linhas = await prisma.tokenIssue.findMany({
        where: { roomName, createdAt: { gte: de, lte: ate }, userName: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { userName: true, moderator: true },
      });
      return nomesDistintos(linhas);
    },

    async clearTokenNamesBefore(data) {
      const r = await prisma.tokenIssue.updateMany({ where: { createdAt: { lt: data }, userName: { not: null } }, data: { userName: null } });
      return r.count;
    },

    createRecording: (dados) => prisma.recording.create({ data: { ...dados, sizeBytes: BigInt(dados.sizeBytes || 0) } }),
    getRecording: (id) => prisma.recording.findUnique({ where: { id } }),
    listRecordings: (clientId, { roomName, limit = 50 } = {}) => prisma.recording.findMany({
      where: { clientId, status: 'READY', ...(roomName ? { roomName } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    async updateRecording(id, dados) {
      const r = await prisma.recording.updateMany({ where: { id }, data: dados });
      return r.count ? prisma.recording.findUnique({ where: { id } }) : null;
    },
    listExpiredRecordings: (agora, limit = 100) => prisma.recording.findMany({
      where: { status: 'READY', expiresAt: { lte: agora } },
      take: limit,
    }),

    async createTranscript({ recordingId, clientId, language = 'pt' }) {
      try {
        return await prisma.transcript.create({ data: { recordingId, clientId, language } });
      } catch (e) {
        if (e.code === 'P2002') throw Object.assign(new Error('transcrição já existe'), { code: 'DUPLICADO' });
        throw e;
      }
    },
    getTranscript: (id) => prisma.transcript.findUnique({ where: { id } }),
    getTranscriptByRecording: (recordingId) => prisma.transcript.findUnique({ where: { recordingId } }),
    async updateTranscript(id, dados) {
      const r = await prisma.transcript.updateMany({ where: { id }, data: dados });
      return r.count ? prisma.transcript.findUnique({ where: { id } }) : null;
    },
    listTranscriptsByStatus: (statuses) => prisma.transcript.findMany({ where: { status: { in: statuses } }, orderBy: { createdAt: 'asc' } }),
    deleteTranscriptByRecording: (recordingId) => prisma.transcript.deleteMany({ where: { recordingId } }),

    async usage(clientId, de, ate) {
      const filtro = { clientId, createdAt: { gte: de, lt: ate } };
      const [sessions, tokens, moderatorTokens, grav, transc, sMes, tMes, gMes] = await Promise.all([
        prisma.session.count({ where: filtro }),
        prisma.tokenIssue.count({ where: filtro }),
        prisma.tokenIssue.count({ where: { ...filtro, moderator: true } }),
        prisma.recording.aggregate({ where: filtro, _count: { _all: true }, _sum: { durationSec: true, sizeBytes: true } }),
        prisma.transcript.aggregate({ where: { ...filtro, status: 'DONE' }, _sum: { durationSec: true } }),
        prisma.$queryRaw`SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n FROM sessions
          WHERE client_id = ${clientId} AND created_at >= ${de} AND created_at < ${ate} GROUP BY m`,
        prisma.$queryRaw`SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n FROM token_issues
          WHERE client_id = ${clientId} AND created_at >= ${de} AND created_at < ${ate} GROUP BY m`,
        prisma.$queryRaw`SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n FROM recordings
          WHERE client_id = ${clientId} AND created_at >= ${de} AND created_at < ${ate} GROUP BY m`,
      ]);
      const porMes = new Map();
      const linha = (m) => porMes.get(m) || porMes.set(m, { month: m, sessions: 0, tokens: 0, recordings: 0 }).get(m);
      sMes.forEach((r) => { linha(r.m).sessions = Number(r.n); });
      tMes.forEach((r) => { linha(r.m).tokens = Number(r.n); });
      gMes.forEach((r) => { linha(r.m).recordings = Number(r.n); });
      return {
        sessions, tokens, moderatorTokens,
        recordings: grav._count._all,
        recordedMinutes: Math.round(Number(grav._sum.durationSec || 0) / 60),
        recordedBytes: Number(grav._sum.sizeBytes || 0),
        transcribedMinutes: Math.round(Number(transc._sum.durationSec || 0) / 60),
        byMonth: [...porMes.values()].sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };
  return store;
}

module.exports = { criarPrismaStore };
