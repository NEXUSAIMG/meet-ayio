const crypto = require('crypto');
const express = require('express');
const { gerarTokenJitsi } = require('../jitsiToken');
const { hashKey } = require('../apiKeys');
const { assinc, gravacaoPublica, nomeArquivo } = require('./comum');
const { apagarGravacao } = require('../retention');
const { transcricaoPublica } = require('../transcricao/fila');
const { situacaoQuotas, temLimite } = require('../quotas');

const SALA_VALIDA = /^[a-z0-9][a-z0-9-]{3,63}$/;

// API dos clientes. Autenticação: x-api-key (ou Authorization: Bearer).
function rotasApi({ cfg, store, storage, notificador, fila }) {
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
    // Quota do mês atingida (minutos gravados ou espaço): o botão some.
    let podeGravar = Boolean(moderator) && features?.recording !== false;
    let recording = { allowed: podeGravar };
    if (podeGravar && temLimite(req.cliente)) {
      const q = await situacaoQuotas(store, req.cliente);
      if (!q.recordingAllowed) {
        podeGravar = false;
        recording = { allowed: false, reason: 'quota_excedida', exceeded: q.exceeded };
      }
    }
    const token = gerarTokenJitsi(cfg, { room, user, moderator, features: { recording: podeGravar } });
    await store.recordToken({ clientId: req.cliente.id, roomName: room, moderator, userName: String(user.name).trim().slice(0, 120) });
    res.json({
      token, roomName: room, expiresIn: cfg.tokenTtlSeconds, ...infoJitsi(),
      joinUrl: urlSala(room) ? `${urlSala(room)}?jwt=${token}` : null,
      recording,
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

  // Exclusão antecipada (pedido do titular, LGPD). Apaga também transcrição e ata.
  r.delete('/recordings/:id', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    await apagarGravacao({ store, storage, notificador, gravacao: g, motivo: 'request' });
    res.status(204).end();
  }));

  // ---------- Transcrição e ata ----------
  r.get('/recordings/:id/transcript', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    const t = await store.getTranscriptByRecording(g.id);
    if (!t) return res.status(404).json({ error: 'sem_transcricao', hint: 'POST /recordings/:id/transcript para pedir' });
    res.json(transcricaoPublica(t, g));
  }));

  // Pede (ou refaz, se falhou) a transcrição + ata desta gravação. Vale mesmo com o
  // automático desligado no cliente: o pedido explícito é o consentimento do cliente.
  r.post('/recordings/:id/transcript', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    let t = await store.getTranscriptByRecording(g.id);
    if (t && (t.status === 'PENDING' || t.status === 'PROCESSING')) return res.status(202).json(transcricaoPublica(t, g));
    if (t && t.status === 'DONE' && req.query.force !== '1') return res.status(409).json({ error: 'ja_transcrita', hint: 'use ?force=1 para refazer' });
    if (temLimite(req.cliente)) {
      const q = await situacaoQuotas(store, req.cliente);
      if (!q.transcriptionAllowed) return res.status(429).json({ error: 'quota_excedida', quota: q });
    }
    t = t
      ? await store.updateTranscript(t.id, { status: 'PENDING', attempts: 0, error: null, text: null, segments: null, minutes: null, minutesModel: null })
      : await store.createTranscript({ recordingId: g.id, clientId: req.cliente.id, language: cfg.transcribe.language });
    fila.enfileirar(t.id);
    res.status(202).json(transcricaoPublica(t, g));
  }));

  // Gera de novo SÓ a ata (sem retranscrever), com participantes e instruções.
  // Body: { participants?: string[], instructions?: string, title?: string }. Síncrono (até ~2 min).
  r.post('/recordings/:id/minutes', assinc(async (req, res) => {
    const g = await gravacaoDoCliente(req, res);
    if (!g) return;
    const t = await store.getTranscriptByRecording(g.id);
    if (!t || t.status !== 'DONE') return res.status(409).json({ error: 'transcricao_nao_pronta', status: t?.status || null });
    if (!t.text) return res.status(409).json({ error: 'sem_fala_na_gravacao' });
    const b = req.body || {};
    const participantes = Array.isArray(b.participants)
      ? b.participants.map((p) => String(p).trim().slice(0, 120)).filter(Boolean).slice(0, 50) : undefined;
    try {
      const atual = await fila.regerarAta({
        transcricao: t, gravacao: g, cliente: req.cliente, participantes,
        instrucoes: b.instructions ? String(b.instructions).slice(0, 4000) : undefined,
        titulo: b.title ? String(b.title).slice(0, 120) : undefined,
      });
      res.json(transcricaoPublica(atual, g));
    } catch (e) {
      if (e.code === 'NAO_CONFIGURADO') return res.status(503).json({ error: 'ata_nao_configurada' });
      res.status(502).json({ error: 'falha_ao_gerar_ata', detail: String(e.message).slice(0, 300) });
    }
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
    const uso = await store.usage(req.cliente.id, de, ate);
    // Quotas (mês corrente; null = sem limite)
    const quota = await situacaoQuotas(store, req.cliente, { uso: req.query.from || req.query.to ? undefined : uso });
    res.json({ client: req.cliente.slug, from: de.toISOString(), to: ate.toISOString(), ...uso, quota });
  }));

  return r;
}

module.exports = { rotasApi };
