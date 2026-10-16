/**
 * Gravacoes de videoconferencia vindas do Meet Ayio.
 * Copiar para SeuCartorio/backend/src/routes/videoGravacao.routes.js
 *
 * Montagem no server.js (ANTES do express.json global, por causa do corpo cru):
 *   app.use('/api/webhooks/meet-ayio', require('./routes/videoGravacao.routes').webhook);
 *   app.use('/api/video-sessions', require('./routes/videoGravacao.routes').gravacoes);
 *
 * Env: MEET_AYIO_WEBHOOK_SECRET (o webhookSecret devolvido no cadastro do cliente).
 * Precisa do model VideoGravacao (ver README desta pasta).
 */
const express = require('express');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const { authMiddleware, clienteOnly } = require('../middlewares/auth.middleware');
const video = require('../services/videoProvider.service');

// ---------- Webhook (publico, autenticado pela assinatura) ----------
const webhook = express.Router();
webhook.post('/', express.raw({ type: 'application/json', limit: '100kb' }), async (req, res) => {
  const corpo = req.body.toString('utf8');
  if (!video.verificarWebhook(corpo, req.get('x-meetayio-signature'))) {
    return res.status(401).json({ erro: 'assinatura invalida' });
  }
  let evento;
  try { evento = JSON.parse(corpo); } catch { return res.status(400).json({ erro: 'json invalido' }); }

  if (evento.event === 'ping') return res.json({ ok: true });
  if (evento.event !== 'recording.ready') return res.json({ ok: true, ignorado: evento.event });

  const g = evento.data || {};
  try {
    const sessao = await prisma.videoSession.findFirst({ where: { room: g.roomName } });
    if (!sessao) {
      logger.warn('[video] gravacao de sala desconhecida', { room: g.roomName, gravacaoId: g.id });
      return res.json({ ok: true, ignorado: 'sala desconhecida' }); // 2xx: nao adianta o Meet Ayio repetir
    }
    // upsert: o Meet Ayio pode reenviar o mesmo evento
    await prisma.videoGravacao.upsert({
      where: { gravacaoId: g.id },
      create: {
        gravacaoId: g.id,
        sessionId: sessao.id,
        empresaId: sessao.empresaId,
        tamanhoBytes: BigInt(g.sizeBytes || 0),
        duracaoSeg: g.durationSec || null,
        expiraEm: g.expiresAt ? new Date(g.expiresAt) : null,
      },
      update: {},
    });
    if (sessao.atendimentoId) {
      prisma.mensagem.create({
        data: {
          atendimentoId: sessao.atendimentoId, remetente: 'SISTEMA', tipo: 'SISTEMA', lida: true, entregue: true,
          conteudo: `Gravação da videoconferência "${sessao.titulo}" disponível.`,
        },
      }).catch((e) => logger.warn('[video] falha ao registrar gravacao no historico', { erro: e.message }));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[video] erro ao registrar gravacao', { erro: err.message });
    return res.status(500).json({ erro: 'erro ao registrar' }); // 5xx: Meet Ayio tenta de novo
  }
});

// ---------- Painel (logado; mesma regra de quem gerencia a sessao) ----------
const gravacoes = express.Router();
gravacoes.use(authMiddleware);

const podeGerenciar = (req, sessao) =>
  req.userRole === 'SUPERADMIN' ||
  (!!req.usuario?.empresaId && sessao.empresaId === req.usuario.empresaId && sessao.criadoPorId === req.usuario.id);

async function gravacaoComPermissao(req, res) {
  const g = await prisma.videoGravacao.findUnique({ where: { gravacaoId: String(req.params.gravacaoId) } });
  const sessao = g && (await prisma.videoSession.findUnique({ where: { id: g.sessionId } }));
  if (!g || !sessao || !podeGerenciar(req, sessao)) {
    res.status(404).json({ erro: 'Gravação não encontrada' });
    return null;
  }
  return g;
}

// Lista as gravacoes de uma sessao.
gravacoes.get('/:id/gravacoes', clienteOnly, async (req, res) => {
  try {
    const sessao = await prisma.videoSession.findUnique({ where: { id: String(req.params.id) } });
    if (!sessao || !podeGerenciar(req, sessao)) return res.status(404).json({ erro: 'Sessão não encontrada' });
    const lista = await prisma.videoGravacao.findMany({ where: { sessionId: sessao.id, apagadaEm: null }, orderBy: { createdAt: 'desc' } });
    return res.json(lista.map((g) => ({ ...g, tamanhoBytes: Number(g.tamanhoBytes) })));
  } catch (err) {
    logger.error('[video] erro ao listar gravacoes', { erro: err.message });
    return res.status(500).json({ erro: 'Erro ao listar gravações' });
  }
});

// Link de download (vale 15 min; gerado na hora pelo Meet Ayio).
gravacoes.get('/gravacoes/:gravacaoId/download', clienteOnly, async (req, res) => {
  try {
    const g = await gravacaoComPermissao(req, res);
    if (!g) return;
    const remota = await video.obterGravacao(g.gravacaoId);
    if (!remota) return res.status(410).json({ erro: 'Gravação expirada ou apagada' });
    return res.json({ url: remota.downloadUrl, expiraEmSegundos: remota.downloadExpiresIn });
  } catch (err) {
    logger.error('[video] erro ao gerar download', { erro: err.message });
    return res.status(502).json({ erro: 'Não foi possível obter a gravação agora' });
  }
});

// Exclusao antecipada (pedido do titular).
gravacoes.delete('/gravacoes/:gravacaoId', clienteOnly, async (req, res) => {
  try {
    const g = await gravacaoComPermissao(req, res);
    if (!g) return;
    await video.apagarGravacao(g.gravacaoId);
    await prisma.videoGravacao.update({ where: { id: g.id }, data: { apagadaEm: new Date() } });
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[video] erro ao apagar gravacao', { erro: err.message });
    return res.status(502).json({ erro: 'Não foi possível apagar a gravação agora' });
  }
});

module.exports = { webhook, gravacoes };
