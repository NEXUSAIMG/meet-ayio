const crypto = require('crypto');
const express = require('express');
const { gerarTokenJitsi } = require('./jitsiToken');

// Salas em memória no v1 (fase 4 troca por banco: clientes, salas, gravações).
function criarApp(cfg) {
  const app = express();
  const salas = new Map(); // roomName → { cliente, criadaEm, titulo }
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Autenticação por API key do cliente (header x-api-key ou Bearer).
  function exigirApiKey(req, res, next) {
    const auth = req.get('authorization') || '';
    const chave = req.get('x-api-key') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
    const cliente = chave && cfg.apiKeys.get(chave);
    if (!cliente) return res.status(401).json({ error: 'api_key_invalida' });
    req.cliente = cliente;
    next();
  }

  const api = express.Router();
  api.use(exigirApiKey);

  // Cria uma sala. Nome com prefixo do cliente + sufixo aleatório (não adivinhável).
  api.post('/sessions', (req, res) => {
    const base = String(req.body?.prefix || 'sala').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'sala';
    const roomName = `${req.cliente}-${base}-${crypto.randomBytes(6).toString('hex')}`;
    salas.set(roomName, { cliente: req.cliente, criadaEm: new Date().toISOString(), titulo: req.body?.title || null });
    res.status(201).json({
      roomName,
      url: cfg.jitsiPublicUrl ? `${cfg.jitsiPublicUrl}/${roomName}` : null,
    });
  });

  // Emite o JWT de entrada numa sala do próprio cliente.
  api.post('/sessions/:room/token', (req, res) => {
    const sala = salas.get(req.params.room);
    if (!sala || sala.cliente !== req.cliente) return res.status(404).json({ error: 'sala_nao_encontrada' });
    const { user, moderator, features } = req.body || {};
    if (!user?.name) return res.status(400).json({ error: 'user.name_obrigatorio' });
    const token = gerarTokenJitsi(cfg, { room: req.params.room, user, moderator, features });
    res.json({
      token,
      expiresIn: cfg.tokenTtlSeconds,
      joinUrl: cfg.jitsiPublicUrl ? `${cfg.jitsiPublicUrl}/${req.params.room}?jwt=${token}` : null,
    });
  });

  // Gravação (Jibri) — fase 6.
  api.post('/sessions/:room/recording/:acao(start|stop)', (_req, res) =>
    res.status(501).json({ error: 'gravacao_ainda_nao_disponivel' }));

  app.use('/api/v1', api);
  return app;
}

module.exports = { criarApp };
