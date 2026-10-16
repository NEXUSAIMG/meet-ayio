const crypto = require('crypto');
const express = require('express');
const { gerarTokenJitsi } = require('./jitsiToken');
const { gerarApiKey, hashKey, igualSeguro } = require('./apiKeys');

const SALA_VALIDA = /^[a-z0-9][a-z0-9-]{3,63}$/;
const PREFIXO_VALIDO = /^[a-z0-9][a-z0-9-]{0,14}-$/;
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,30}$/;

// Express 4 não captura rejeição de handler async.
const assinc = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function criarApp(cfg, store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const urlSala = (room) => (cfg.jitsiDomain ? `https://${cfg.jitsiDomain}/${room}` : null);
  const infoJitsi = () => ({
    domain: cfg.jitsiDomain || null,
    scriptUrl: cfg.jitsiDomain ? `https://${cfg.jitsiDomain}/external_api.js` : null,
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---------- Admin (cadastro de clientes) ----------
  const admin = express.Router();
  admin.use((req, res, next) => {
    const auth = req.get('authorization') || '';
    if (!cfg.adminToken || !igualSeguro(auth.replace(/^Bearer /, ''), cfg.adminToken)) {
      return res.status(401).json({ error: 'nao_autorizado' });
    }
    next();
  });
  const semSegredo = ({ apiKeyHash, ...c }) => c;

  admin.get('/clients', assinc(async (_req, res) => {
    res.json((await store.listClients()).map(semSegredo));
  }));

  // Cria cliente e devolve a API key UMA única vez.
  admin.post('/clients', assinc(async (req, res) => {
    const { slug, name, roomPrefix, webhookUrl } = req.body || {};
    if (!SLUG_VALIDO.test(slug || '')) return res.status(400).json({ error: 'slug_invalido' });
    const prefixo = roomPrefix || `${slug}-`;
    if (!PREFIXO_VALIDO.test(prefixo)) return res.status(400).json({ error: 'room_prefix_invalido' });
    const apiKey = gerarApiKey();
    try {
      const c = await store.createClient({
        slug, name: String(name || slug).slice(0, 120), roomPrefix: prefixo,
        apiKeyHash: hashKey(apiKey), webhookUrl: webhookUrl || null,
      });
      res.status(201).json({ ...semSegredo(c), apiKey });
    } catch (e) {
      if (e.code === 'DUPLICADO') return res.status(409).json({ error: 'slug_ou_prefixo_ja_existe' });
      throw e;
    }
  }));

  admin.post('/clients/:slug/rotate-key', assinc(async (req, res) => {
    const apiKey = gerarApiKey();
    const c = await store.updateClient(req.params.slug, { apiKeyHash: hashKey(apiKey) });
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json({ ...semSegredo(c), apiKey });
  }));

  admin.patch('/clients/:slug', assinc(async (req, res) => {
    const dados = {};
    if (typeof req.body?.active === 'boolean') dados.active = req.body.active;
    if (req.body?.webhookUrl !== undefined) dados.webhookUrl = req.body.webhookUrl || null;
    if (req.body?.name) dados.name = String(req.body.name).slice(0, 120);
    const c = await store.updateClient(req.params.slug, dados);
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json(semSegredo(c));
  }));

  app.use('/admin', admin);

  // ---------- API dos clientes (x-api-key ou Bearer) ----------
  const api = express.Router();
  api.use(assinc(async (req, res, next) => {
    const auth = req.get('authorization') || '';
    const chave = req.get('x-api-key') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
    const cliente = chave ? await store.findClientByKeyHash(hashKey(chave)) : null;
    if (!cliente || !cliente.active) return res.status(401).json({ error: 'api_key_invalida' });
    req.cliente = cliente;
    next();
  }));

  // Emite o token de uma sala do cliente. A sala precisa ter o prefixo do cliente
  // e não pode pertencer a outro cliente. Cria o registro da sala no 1º token.
  async function emitir(req, res, room) {
    room = String(room || '').toLowerCase();
    if (!SALA_VALIDA.test(room) || !room.startsWith(req.cliente.roomPrefix)) {
      return res.status(400).json({ error: 'sala_invalida', roomPrefix: req.cliente.roomPrefix });
    }
    const existente = await store.getSession(room);
    if (existente && existente.clientId !== req.cliente.id) return res.status(404).json({ error: 'sala_nao_encontrada' });
    const { user, moderator, features } = req.body || {};
    if (!user?.name) return res.status(400).json({ error: 'user.name_obrigatorio' });
    const token = gerarTokenJitsi(cfg, { room, user, moderator, features });
    await store.recordToken({ clientId: req.cliente.id, roomName: room, moderator });
    res.json({
      token, roomName: room, expiresIn: cfg.tokenTtlSeconds, ...infoJitsi(),
      joinUrl: urlSala(room) ? `${urlSala(room)}?jwt=${token}` : null,
    });
  }

  api.post('/tokens', assinc((req, res) => emitir(req, res, req.body?.room)));

  // Cria uma sala com nome não adivinhável (para clientes que não geram o próprio nome).
  api.post('/sessions', assinc(async (req, res) => {
    const base = String(req.body?.prefix || 'sala').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'sala';
    const roomName = `${req.cliente.roomPrefix}${base}-${crypto.randomBytes(6).toString('hex')}`;
    await store.createSession({ roomName, clientId: req.cliente.id, title: req.body?.title ? String(req.body.title).slice(0, 120) : null });
    res.status(201).json({ roomName, url: urlSala(roomName), ...infoJitsi() });
  }));

  api.post('/sessions/:room/token', assinc((req, res) => emitir(req, res, req.params.room)));

  // Uso do próprio cliente. Padrão: mês corrente. ?from=2026-10-01&to=2026-11-01
  api.get('/usage', assinc(async (req, res) => {
    const agora = new Date();
    const de = req.query.from ? new Date(req.query.from) : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const ate = req.query.to ? new Date(req.query.to) : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
    if (isNaN(de) || isNaN(ate) || de >= ate) return res.status(400).json({ error: 'periodo_invalido' });
    res.json({ client: req.cliente.slug, from: de.toISOString(), to: ate.toISOString(), ...(await store.usage(req.cliente.id, de, ate)) });
  }));

  // Gravação (Jibri) — fase 6.
  api.post('/sessions/:room/recording/:acao(start|stop)', (_req, res) =>
    res.status(501).json({ error: 'gravacao_ainda_nao_disponivel' }));

  app.use('/api/v1', api);

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[meet-ayio-api]', err);
    res.status(500).json({ error: 'erro_interno' });
  });
  return app;
}

module.exports = { criarApp };
