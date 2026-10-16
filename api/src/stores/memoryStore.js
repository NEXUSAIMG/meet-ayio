const crypto = require('crypto');
const { hashKey } = require('../apiKeys');
const { nomesDistintos } = require('./comum');

// Store em memória: testes e dev local sem banco. Mesma interface do prismaStore.
function criarMemoryStore({ seedClientes = [] } = {}) {
  const clientes = new Map(); // slug → cliente
  const sessoes = new Map(); // roomName → sessão
  const emissoes = []; // tokens emitidos (uso)
  const gravacoes = new Map(); // id → gravação
  const transcricoes = new Map(); // id → transcrição
  const copia = (o) => (o ? { ...o } : null);
  const duplicado = (msg) => Object.assign(new Error(msg), { code: 'DUPLICADO' });

  const store = {
    async findClientByKeyHash(hash) {
      return copia([...clientes.values()].find((c) => c.apiKeyHash === hash));
    },
    async getClientById(id) {
      return copia([...clientes.values()].find((c) => c.id === id));
    },
    async createClient({
      slug, name, roomPrefix, apiKeyHash, webhookUrl = null, webhookSecret = null, recordingRetentionDays = 30,
      transcriptionEnabled = false, minutesPrompt = null,
      quotaRecordedMinutes = null, quotaTranscribedMinutes = null, quotaStorageMb = null,
    }) {
      if (clientes.has(slug)) throw duplicado('slug já existe');
      if ([...clientes.values()].some((c) => c.roomPrefix === roomPrefix)) throw duplicado('prefixo já usado');
      const c = {
        id: crypto.randomUUID(), slug, name, roomPrefix, apiKeyHash, webhookUrl, webhookSecret,
        recordingRetentionDays, transcriptionEnabled, minutesPrompt, active: true, createdAt: new Date(),
        quotaRecordedMinutes, quotaTranscribedMinutes, quotaStorageMb,
      };
      clientes.set(slug, c);
      return copia(c);
    },
    async listClients() {
      return [...clientes.values()].map(copia);
    },
    async updateClient(slug, dados) {
      const c = clientes.get(slug);
      if (!c) return null;
      Object.assign(c, dados);
      return copia(c);
    },
    async getClientBySlug(slug) {
      return copia(clientes.get(slug));
    },
    async ping() {
      return true;
    },

    async createSession({ roomName, clientId, title = null }) {
      const s = { id: crypto.randomUUID(), roomName, clientId, title, createdAt: new Date() };
      sessoes.set(roomName, s);
      return copia(s);
    },
    async getSession(roomName) {
      return copia(sessoes.get(roomName));
    },
    // Registra a emissão; cria a sessão se a sala ainda não existir (salas do próprio cliente).
    async recordToken({ clientId, roomName, moderator, userName = null }) {
      if (!sessoes.has(roomName)) await store.createSession({ roomName, clientId });
      emissoes.push({ clientId, roomName, moderator: Boolean(moderator), userName, createdAt: new Date() });
    },
    async listParticipantNames(roomName, de, ate) {
      return nomesDistintos(emissoes.filter((e) => e.roomName === roomName && e.createdAt >= de && e.createdAt <= ate && e.userName));
    },
    async clearTokenNamesBefore(data) {
      let n = 0;
      for (const e of emissoes) if (e.createdAt < data && e.userName) { e.userName = null; n++; }
      return n;
    },
    // Testes: envelhece emissões (simula o tempo passando).
    _envelhecerTokens(ms) {
      for (const e of emissoes) e.createdAt = new Date(e.createdAt.getTime() - ms);
    },

    async createRecording(dados) {
      const g = {
        id: crypto.randomUUID(), contentType: 'video/mp4', durationSec: null, status: 'READY',
        webhookStatus: 'NONE', webhookAttempts: 0, createdAt: new Date(), deletedAt: null, ...dados,
      };
      gravacoes.set(g.id, g);
      return copia(g);
    },
    async getRecording(id) {
      return copia(gravacoes.get(id));
    },
    async listRecordings(clientId, { roomName, limit = 50 } = {}) {
      return [...gravacoes.values()]
        .filter((g) => g.clientId === clientId && g.status === 'READY' && (!roomName || g.roomName === roomName))
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(copia);
    },
    async updateRecording(id, dados) {
      const g = gravacoes.get(id);
      if (!g) return null;
      Object.assign(g, dados);
      return copia(g);
    },
    async listExpiredRecordings(agora, limit = 100) {
      return [...gravacoes.values()].filter((g) => g.status === 'READY' && g.expiresAt <= agora).slice(0, limit).map(copia);
    },
    // Espaço ocupado agora (gravações ainda guardadas).
    async storageBytes(clientId) {
      return [...gravacoes.values()].filter((g) => g.clientId === clientId && g.status === 'READY')
        .reduce((a, g) => a + Number(g.sizeBytes || 0), 0);
    },
    // Monitoramento: gravações (de qualquer cliente) por estado do webhook.
    async listRecordingsByWebhookStatus(statuses, { since, limit = 50 } = {}) {
      return [...gravacoes.values()]
        .filter((g) => g.status === 'READY' && statuses.includes(g.webhookStatus) && (!since || g.createdAt >= since))
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(copia);
    },

    async createTranscript({ recordingId, clientId, language = 'pt' }) {
      if ([...transcricoes.values()].some((t) => t.recordingId === recordingId)) throw duplicado('transcrição já existe');
      const t = {
        id: crypto.randomUUID(), recordingId, clientId, status: 'PENDING', language, text: null, segments: null,
        durationSec: null, minutes: null, minutesModel: null, error: null, attempts: 0, createdAt: new Date(), updatedAt: new Date(),
      };
      transcricoes.set(t.id, t);
      return copia(t);
    },
    async getTranscript(id) {
      return copia(transcricoes.get(id));
    },
    async getTranscriptByRecording(recordingId) {
      return copia([...transcricoes.values()].find((t) => t.recordingId === recordingId));
    },
    async updateTranscript(id, dados) {
      const t = transcricoes.get(id);
      if (!t) return null;
      Object.assign(t, dados, { updatedAt: new Date() });
      return copia(t);
    },
    async listTranscriptsByStatus(statuses) {
      return [...transcricoes.values()].filter((t) => statuses.includes(t.status)).map(copia);
    },
    async deleteTranscriptByRecording(recordingId) {
      for (const [id, t] of transcricoes) if (t.recordingId === recordingId) transcricoes.delete(id);
    },
    // Monitoramento da fila: contagem por estado e a pendência mais antiga.
    async transcriptStats() {
      const byStatus = { PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0 };
      let oldestPendingAt = null;
      for (const t of transcricoes.values()) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        if ((t.status === 'PENDING' || t.status === 'PROCESSING') && (!oldestPendingAt || t.createdAt < oldestPendingAt)) {
          oldestPendingAt = t.createdAt;
        }
      }
      return { byStatus, oldestPendingAt };
    },
    async listFailedTranscripts({ since, limit = 20 } = {}) {
      return [...transcricoes.values()]
        .filter((t) => t.status === 'FAILED' && (!since || t.updatedAt >= since))
        .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map(copia);
    },

    async usage(clientId, de, ate) {
      const dentro = (x) => x.clientId === clientId && x.createdAt >= de && x.createdAt < ate;
      const s = [...sessoes.values()].filter(dentro);
      const t = emissoes.filter(dentro);
      const g = [...gravacoes.values()].filter(dentro);
      const porMes = new Map();
      const linha = (d) => {
        const m = d.toISOString().slice(0, 7);
        if (!porMes.has(m)) porMes.set(m, { month: m, sessions: 0, tokens: 0, recordings: 0 });
        return porMes.get(m);
      };
      s.forEach((x) => { linha(x.createdAt).sessions++; });
      t.forEach((x) => { linha(x.createdAt).tokens++; });
      g.forEach((x) => { linha(x.createdAt).recordings++; });
      return {
        sessions: s.length,
        tokens: t.length,
        moderatorTokens: t.filter((x) => x.moderator).length,
        recordings: g.length,
        recordedMinutes: Math.round(g.reduce((a, x) => a + (x.durationSec || 0), 0) / 60),
        recordedBytes: g.reduce((a, x) => a + Number(x.sizeBytes || 0), 0),
        transcribedMinutes: Math.round([...transcricoes.values()]
          .filter((x) => dentro(x) && x.status === 'DONE').reduce((a, x) => a + (x.durationSec || 0), 0) / 60),
        byMonth: [...porMes.values()].sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };

  for (const c of seedClientes) {
    store.createClient({ slug: c.slug, name: c.slug, roomPrefix: c.roomPrefix, apiKeyHash: hashKey(c.apiKey) });
  }
  return store;
}

module.exports = { criarMemoryStore };
