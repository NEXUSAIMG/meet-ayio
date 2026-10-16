// Utilitários compartilhados pelas rotas.

// Express 4 não captura rejeição de handler async.
const assinc = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Gravação como o cliente vê (sem storageKey; BigInt → Number).
const gravacaoPublica = (g) => ({
  id: g.id,
  roomName: g.roomName,
  contentType: g.contentType,
  sizeBytes: Number(g.sizeBytes || 0),
  durationSec: g.durationSec ?? null,
  status: g.status,
  webhookStatus: g.webhookStatus,
  createdAt: new Date(g.createdAt).toISOString(),
  expiresAt: new Date(g.expiresAt).toISOString(),
});

const nomeArquivo = (g) => `${g.roomName}-${new Date(g.createdAt).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.mp4`;

module.exports = { assinc, gravacaoPublica, nomeArquivo };
