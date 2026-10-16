const crypto = require('crypto');
const express = require('express');
const { gerarTokenJitsi } = require('../jitsiToken');
const { hashKey } = require('../apiKeys');
const { assinc, gravacaoPublica, nomeArquivo } = require('./comum');

const SALA_VALIDA = /^[a-z0-9][a-z0-9-]{3,63}$/;

// API dos clientes. Autenticação: x-api-key (ou Authorization: Bearer).
function rotasApi({ cfg, store, storage, notificador }) {
  const r = express.Router();
  const urlSala = (room) => (cfg.jitsiDomain ? `https://${cfg.jitsiDomain}/${room}` : null);
  const infoJitsi = () => ({
    domain: cfg.jitsiDomain || null,
    scriptUrl: cfg.jitsiDomain ? `https://${cfg.jitsiDomain}/external_api.js` : null,
  });

  r.use(assinc(async (req, res, next) => {
    const auth = req.get('authorization') || '';
    const chave = req.get('x-api-key') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
    const cliente = chave ? await store.findClientByKeyHash(hashKey(chave)) : null;
    if (!cliente || !cliente.active) return res.status(401).json({ error: 'api_key_invalida' });
    req.cliente = cliente;
    next();
  }));

  // ---------- Tokens e salas ----------
  // A sala precisa ter o prefixo do cliente e não pode pertencer a outro cliente.
  async function emitir(req, res, room) {
    room = String(room || '').toLowerCase();
    if (!SALA_VALIDA.test(room) || !room.startsWith(req.cliente.roomPrefix)) {
      return res.status(400).json({ error: 'sala_invalida', roomPrefix: req.cliente.roomPrefix });
    }
    const existente = await store.getSession(room);
    if (existente && existente.clientId !== req.cliente.id) return res.status(404).json({ error: 'sala_nao_encontrada' });
    const { user, moderator, features } = req.body || {};
    if (!user?.name) return res.status(400).json({ error: 'user.name_obrigatorio' });
    // Moderador pode gravar por padrão (botão "Gravar" no Jitsi); cliente pode desligar.
    const podeGravar = Boolean(moderator) && features?.recording !== false;
    const token = gerarTokenJitsi(cfg, { room, user, moderator, features: { recording: podeGravar } });
    await store.recordToken({ clientId: req.cliente.id, roomName: room, moderator });
    res.json({
      token, roomName: room, expiresIn: cfg.tokenTtlSeconds, ...infoJitsi(),
      joinUrl: urlSala(room) ? `${urlSala(room)}?jwt=${token}` : null,
    });
  }

  r.post('/tokens', assinc((req, res) => emitir(req, res, req.body?.room)));

  // Cria uma sala com nome não adivinhável (para clientes que não geram o próprio nome).
  r.post('/sessions', assinc(async (req, res) => {
    const base = String(req.body?.prefix || 'sala').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'sala';
    const roomName = `${req.cliente.roomPrefix}${base}-${crypto.randomBytes(6).toString('hex')}`;
    const title = req.body?.title ? String(req.body.title).slice(0, 120) : null;
    await store.createSession({ roomName, clientId: req.cliente.id, title });
    res.status(201).json({ roomName, url: urlSala(roomName), ...infoJitsi() });
  }));

  r.post('/sessions/:room/token', assinc((req, res) => emitir(req, res, req.params.room)));

  // ---------- Gravações ----------
  // Gravar: o moderador inicia/para na própria chamada (botão do Jitsi). Ao terminar,
  // o Jibri envia o arquivo e o cliente recebe o webhook recording.ready.
  const gravacaoDoCliente = async (req, res) => {
    const g = await store.getRecording(req.params.id);
    if (!g || g.clientId !== req.cliente.id || g.status !== 'READY') {
      res.status(404).json({ error: 'gravacao_nao_encontrada' });
      return null;
    }
    return g;
  };

  r.get('/recordings', assinc(async (req, res) => {
    const roomName = req.query.room ? String(req.query.room).toLowerCase() : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json((await store.listRecordings(req.cliente.id, { roomName, limit })).map(gravacaoPublica));
  }));

  r.get('/recordings/:id', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    const downloadUrl = await storage.downloadUrl(g.storageKey, cfg.downloadTtlSeconds, { filename: nomeArquivo(g) });
    res.json({ ...gravacaoPublica(g), downloadUrl, downloadExpiresIn: cfg.downloadTtlSeconds });
  }));

  // Exclusão antecipada (pedido do titular, LGPD).
  r.delete('/recordings/:id', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    await storage.delete(g.storageKey);
    await store.updateRecording(g.id, { status: 'DELETED', deletedAt: new Date() });
    res.status(204).end();
  }));

  // Reenvia o webhook recording.ready (ex.: endpoint do cliente estava fora do ar).
  r.post('/recordings/:id/webhook', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    if (!req.cliente.webhookUrl) return res.status(409).json({ error: 'cliente_sem_webhook_url' });
    await notificador.notificarGravacao(g, req.cliente, gravacaoPublica(g));
    res.status(202).json({ ok: true });
  }));

  // Testa o endpoint de webhook do cliente com um evento "ping".
  r.post('/webhooks/test', assinc(async (req, res) => {
    if (!req.cliente.webhookUrl) return res.status(409).json({ error: 'cliente_sem_webhook_url' });
    const r2 = await notificador.enviar({ url: req.cliente.webhookUrl, segredo: req.cliente.webhookSecret, evento: 'ping', dados: { client: req.cliente.slug } });
    res.json({ delivered: r2.ok, status: r2.status, ...(r2.erro ? { error: r2.erro } : {}) });
  }));

  // ---------- Uso ----------
  // Padrão: mês corrente. ?from=2026-10-01&to=2026-11-01
  r.get('/usage', assinc(async (req, res) => {
    const agora = new Date();
    const de = req.query.from ? new Date(req.query.from) : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const ate = req.query.to ? new Date(req.query.to) : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
    if (isNaN(de) || isNaN(ate) || de >= ate) return res.status(400).json({ error: 'periodo_invalido' });
    res.json({ client: req.cliente.slug, from: de.toISOString(), to: ate.toISOString(), ...(await store.usage(req.cliente.id, de, ate)) });
  }));

  return r;
}

module.exports = { rotasApi };
