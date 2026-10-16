const crypto = require('crypto');
const express = require('express');
const { igualSeguro } = require('../apiKeys');
const { assinc, gravacaoPublica } = require('./comum');

const SALA_VALIDA = /^[a-z0-9][a-z0-9-]{3,63}$/;

// Rotas usadas só pela infraestrutura (script de finalização do Jibri).
// Autenticação: Authorization: Bearer $RECORDER_SECRET.
function rotasInternas({ cfg, store, storage, notificador, fila }) {
  const r = express.Router();
  r.use((req, res, next) => {
    const auth = (req.get('authorization') || '').replace(/^Bearer /, '');
    if (!cfg.recorderSecret || !igualSeguro(auth, cfg.recorderSecret)) return res.status(401).json({ error: 'nao_autorizado' });
    next();
  });

  // PUT /internal/recordings?room=<sala>&durationSec=<n>   corpo = arquivo (video/mp4), em stream.
  r.put('/recordings', assinc(async (req, res) => {
    const room = String(req.query.room || '').toLowerCase();
    if (!SALA_VALIDA.test(room)) return res.status(400).json({ error: 'sala_invalida' });
    const sessao = await store.getSession(room);
    if (!sessao) return res.status(404).json({ error: 'sala_desconhecida' });
    const cliente = await store.getClientById(sessao.clientId);
    if (!cliente) return res.status(404).json({ error: 'cliente_desconhecido' });

    const contentType = (req.get('content-type') || 'video/mp4').split(';')[0];
    const ext = contentType === 'video/webm' ? 'webm' : 'mp4';
    const carimbo = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const storageKey = `${cliente.slug}/${room}/${carimbo}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { sizeBytes } = await storage.put(storageKey, req, { contentType });
    if (!sizeBytes) {
      await storage.delete(storageKey);
      return res.status(400).json({ error: 'arquivo_vazio' });
    }

    const duracao = Number(req.query.durationSec);
    const dias = cliente.recordingRetentionDays || 30;
    const g = await store.createRecording({
      clientId: cliente.id, roomName: room, storageKey, contentType, sizeBytes,
      durationSec: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : null,
      expiresAt: new Date(Date.now() + dias * 24 * 60 * 60 * 1000),
    });
    await notificador.notificarGravacao(g, cliente, gravacaoPublica(g));
    let transcricao = null;
    if (cliente.transcriptionEnabled && fila) {
      transcricao = await store.createTranscript({ recordingId: g.id, clientId: cliente.id, language: cfg.transcribe.language });
      fila.enfileirar(transcricao.id);
    }
    res.status(201).json({ id: g.id, sizeBytes, transcription: transcricao ? 'PENDING' : 'OFF' });
  }));

  return r;
}

// Download do storage local por URL assinada (não usado com S3).
function rotasArquivos({ storage }) {
  const r = express.Router();
  r.get('/:token', assinc(async (req, res) => {
    const alvo = storage.verificar(req.params.token);
    if (!alvo) return res.status(403).json({ error: 'link_invalido_ou_expirado' });
    let arq;
    try { arq = await storage.abrir(alvo.key); } catch { return res.status(404).json({ error: 'arquivo_nao_encontrado' }); }
    res.set({
      'content-type': alvo.key.endsWith('.webm') ? 'video/webm' : 'video/mp4',
      'content-length': String(arq.size),
      'content-disposition': `attachment; filename="${alvo.filename}"`,
      'cache-control': 'private, no-store',
    });
    arq.stream.pipe(res);
  }));
  return r;
}

module.exports = { rotasInternas, rotasArquivos };
