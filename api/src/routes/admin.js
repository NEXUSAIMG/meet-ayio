const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { gerarApiKey, hashKey, igualSeguro } = require('../apiKeys');
const { assinc, gravacaoPublica, nomeArquivo } = require('./comum');
const { lerQuotas, situacaoQuotas, periodoDoMes } = require('../quotas');
const { verificarSaude } = require('../saude');
const { apagarGravacao } = require('../retention');
const { transcricaoPublica } = require('../transcricao/fila');

const PREFIXO_VALIDO = /^[a-z0-9][a-z0-9-]{0,14}-$/;
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,30}$/;
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const gerarSegredoWebhook = () => 'whsec_' + crypto.randomBytes(24).toString('base64url');
const urlValida = (u) => { try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } };

const PAINEL = path.join(__dirname, '..', 'painel', 'index.html');
// O painel é estático: sem dados embutidos. Ele pede o ADMIN_TOKEN e chama as rotas abaixo.
const CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
  "connect-src 'self'", "img-src 'self' data:", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

// Administração do Meet Ayio. Autenticação: Authorization: Bearer $ADMIN_TOKEN
// (exceto a página do painel, que não carrega nada sem o token).
function rotasAdmin({ cfg, store, storage, notificador, fila }) {
  const r = express.Router();

  r.get('/', (_req, res) => res.redirect('/admin/painel'));
  r.get('/painel', (_req, res) => {
    res.set({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    });
    res.send(fs.readFileSync(PAINEL, 'utf8'));
  });

  r.use((req, res, next) => {
    const auth = req.get('authorization') || '';
    if (!cfg.adminToken || !igualSeguro(auth.replace(/^Bearer /, ''), cfg.adminToken)) {
      return res.status(401).json({ error: 'nao_autorizado' });
    }
    next();
  });
  const publico = ({ apiKeyHash, webhookSecret, ...c }) => ({ ...c, hasWebhookSecret: Boolean(webhookSecret) });

  const clienteDoSlug = async (req, res) => {
    const c = await store.getClientBySlug(req.params.slug);
    if (!c) res.status(404).json({ error: 'cliente_nao_encontrado' });
    return c;
  };
  const gravacaoDoId = async (req, res) => {
    const g = await store.getRecording(req.params.id);
    if (!g || g.status !== 'READY') res.status(404).json({ error: 'gravacao_nao_encontrada' });
    return g && g.status === 'READY' ? g : null;
  };

  // ---------- Saúde ----------
  r.get('/health', assinc(async (_req, res) => {
    const s = await verificarSaude({ cfg, store, storage, notificador, fila });
    res.status(s.status === 'down' ? 503 : 200).json(s);
  }));

  // ---------- Clientes ----------
  r.get('/clients', assinc(async (_req, res) => {
    res.json((await store.listClients()).map(publico));
  }));

  r.get('/clients/:slug', assinc(async (req, res) => {
    const c = await clienteDoSlug(req, res);
    if (c) res.json(publico(c));
  }));

  // Cria cliente e devolve apiKey e webhookSecret UMA única vez.
  r.post('/clients', assinc(async (req, res) => {
    const { slug, name, roomPrefix, webhookUrl, recordingRetentionDays, transcriptionEnabled } = req.body || {};
    if (!SLUG_VALIDO.test(slug || '')) return res.status(400).json({ error: 'slug_invalido' });
    const prefixo = roomPrefix || `${slug}-`;
    if (!PREFIXO_VALIDO.test(prefixo)) return res.status(400).json({ error: 'room_prefix_invalido' });
    if (webhookUrl && !urlValida(webhookUrl)) return res.status(400).json({ error: 'webhook_url_invalida' });
    const quotas = lerQuotas(req.body);
    if (quotas.erro) return res.status(400).json({ error: 'quota_invalida', field: quotas.erro });
    const apiKey = gerarApiKey();
    const webhookSecret = gerarSegredoWebhook();
    try {
      const c = await store.createClient({
        slug, name: String(name || slug).slice(0, 120), roomPrefix: prefixo,
        apiKeyHash: hashKey(apiKey), webhookUrl: webhookUrl || null, webhookSecret,
        recordingRetentionDays: Number.isInteger(recordingRetentionDays) ? recordingRetentionDays : 30,
        transcriptionEnabled: transcriptionEnabled === true,
        ...quotas.dados,
      });
      res.status(201).json({ ...publico(c), apiKey, webhookSecret });
    } catch (e) {
      if (e.code === 'DUPLICADO') return res.status(409).json({ error: 'slug_ou_prefixo_ja_existe' });
      throw e;
    }
  }));

  r.post('/clients/:slug/rotate-key', assinc(async (req, res) => {
    const apiKey = gerarApiKey();
    const c = await store.updateClient(req.params.slug, { apiKeyHash: hashKey(apiKey) });
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json({ ...publico(c), apiKey });
  }));

  r.post('/clients/:slug/rotate-webhook-secret', assinc(async (req, res) => {
    const webhookSecret = gerarSegredoWebhook();
    const c = await store.updateClient(req.params.slug, { webhookSecret });
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json({ ...publico(c), webhookSecret });
  }));

  r.patch('/clients/:slug', assinc(async (req, res) => {
    const b = req.body || {};
    const dados = {};
    if (typeof b.active === 'boolean') dados.active = b.active;
    if (b.name) dados.name = String(b.name).slice(0, 120);
    if (b.webhookUrl !== undefined) {
      if (b.webhookUrl && !urlValida(b.webhookUrl)) return res.status(400).json({ error: 'webhook_url_invalida' });
      dados.webhookUrl = b.webhookUrl || null;
    }
    if (b.transcriptionEnabled !== undefined) {
      if (typeof b.transcriptionEnabled !== 'boolean') return res.status(400).json({ error: 'transcription_enabled_invalido' });
      dados.transcriptionEnabled = b.transcriptionEnabled;
    }
    if (b.minutesPrompt !== undefined) {
      if (b.minutesPrompt !== null && (typeof b.minutesPrompt !== 'string' || b.minutesPrompt.length > 8000)) {
        return res.status(400).json({ error: 'minutes_prompt_invalido', max: 8000 });
      }
      dados.minutesPrompt = b.minutesPrompt?.trim() || null;
    }
    if (b.recordingRetentionDays !== undefined) {
      const d = Number(b.recordingRetentionDays);
      if (!Number.isInteger(d) || d < 1 || d > 3650) return res.status(400).json({ error: 'retencao_invalida' });
      dados.recordingRetentionDays = d;
    }
    const quotas = lerQuotas(b);
    if (quotas.erro) return res.status(400).json({ error: 'quota_invalida', field: quotas.erro });
    Object.assign(dados, quotas.dados);
    const c = await store.updateClient(req.params.slug, dados);
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json(publico(c));
  }));

  r.post('/clients/:slug/webhook-test', assinc(async (req, res) => {
    const c = await clienteDoSlug(req, res);
    if (!c) return;
    if (!c.webhookUrl) return res.status(409).json({ error: 'cliente_sem_webhook_url' });
    const r2 = await notificador.enviar({ url: c.webhookUrl, segredo: c.webhookSecret, evento: 'ping', dados: { client: c.slug } });
    res.json({ delivered: r2.ok, status: r2.status, ...(r2.erro ? { error: r2.erro } : {}) });
  }));

  // ---------- Uso e quotas ----------
  // Todos os clientes num mês (padrão: mês corrente, UTC). ?month=2026-10
  r.get('/usage', assinc(async (req, res) => {
    const mes = req.query.month ? String(req.query.month) : null;
    if (mes && !MES_VALIDO.test(mes)) return res.status(400).json({ error: 'mes_invalido', formato: 'AAAA-MM' });
    const ref = mes ? new Date(`${mes}-15T00:00:00Z`) : new Date();
    const { de, ate, mes: mesRef } = periodoDoMes(ref);
    const corrente = mesRef === periodoDoMes().mes;
    const linhas = [];
    for (const c of await store.listClients()) {
      const uso = await store.usage(c.id, de, ate);
      const { byMonth, ...total } = uso;
      // Quotas só fazem sentido para o mês corrente.
      const quota = corrente ? await situacaoQuotas(store, c, { uso }) : null;
      linhas.push({
        slug: c.slug, name: c.name, active: c.active, transcriptionEnabled: c.transcriptionEnabled,
        ...total, storageMb: quota?.used?.storageMb ?? Math.ceil((await store.storageBytes(c.id)) / 1_048_576),
        quota,
      });
    }
    res.json({ month: mesRef, from: de.toISOString(), to: ate.toISOString(), clients: linhas });
  }));

  // ---------- Gravações ----------
  r.get('/clients/:slug/recordings', assinc(async (req, res) => {
    const c = await clienteDoSlug(req, res);
    if (!c) return;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const roomName = req.query.room ? String(req.query.room).toLowerCase() : undefined;
    const lista = [];
    for (const g of await store.listRecordings(c.id, { roomName, limit })) {
      const t = await store.getTranscriptByRecording(g.id);
      lista.push({
        ...gravacaoPublica(g), webhookAttempts: g.webhookAttempts || 0,
        transcript: t ? { status: t.status, error: t.error, hasMinutes: Boolean(t.minutes), attempts: t.attempts } : null,
      });
    }
    res.json(lista);
  }));

  r.get('/recordings/:id/download', assinc(async (req, res) => {
    const g = await gravacaoDoId(req, res);
    if (!g) return;
    const downloadUrl = await storage.downloadUrl(g.storageKey, cfg.downloadTtlSeconds, { filename: nomeArquivo(g) });
    res.json({ downloadUrl, downloadExpiresIn: cfg.downloadTtlSeconds });
  }));

  r.get('/recordings/:id/transcript', assinc(async (req, res) => {
    const g = await gravacaoDoId(req, res);
    if (!g) return;
    const t = await store.getTranscriptByRecording(g.id);
    if (!t) return res.status(404).json({ error: 'sem_transcricao' });
    res.json(transcricaoPublica(t, g));
  }));

  // Reenvia recording.ready (ex.: cliente estava fora do ar ou o processo reiniciou).
  r.post('/recordings/:id/webhook', assinc(async (req, res) => {
    const g = await gravacaoDoId(req, res);
    if (!g) return;
    const c = await store.getClientById(g.clientId);
    if (!c?.webhookUrl) return res.status(409).json({ error: 'cliente_sem_webhook_url' });
    await notificador.notificarGravacao(g, c, gravacaoPublica(g));
    res.status(202).json({ ok: true });
  }));

  // (Re)transcreve. O admin pode passar por cima da quota do cliente.
  r.post('/recordings/:id/transcript', assinc(async (req, res) => {
    const g = await gravacaoDoId(req, res);
    if (!g) return;
    let t = await store.getTranscriptByRecording(g.id);
    if (t && (t.status === 'PENDING' || t.status === 'PROCESSING')) return res.status(202).json(transcricaoPublica(t, g));
    t = t
      ? await store.updateTranscript(t.id, { status: 'PENDING', attempts: 0, error: null, text: null, segments: null, minutes: null, minutesModel: null })
      : await store.createTranscript({ recordingId: g.id, clientId: g.clientId, language: cfg.transcribe.language });
    fila.enfileirar(t.id);
    res.status(202).json(transcricaoPublica(t, g));
  }));

  r.delete('/recordings/:id', assinc(async (req, res) => {
    const g = await gravacaoDoId(req, res);
    if (!g) return;
    await apagarGravacao({ store, storage, notificador, gravacao: g, motivo: 'admin' });
    res.status(204).end();
  }));

  return r;
}

module.exports = { rotasAdmin };
