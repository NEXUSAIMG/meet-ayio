const crypto = require('crypto');
const express = require('express');
const { gerarApiKey, hashKey, igualSeguro } = require('../apiKeys');
const { assinc } = require('./comum');

const PREFIXO_VALIDO = /^[a-z0-9][a-z0-9-]{0,14}-$/;
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,30}$/;
const gerarSegredoWebhook = () => 'whsec_' + crypto.randomBytes(24).toString('base64url');
const urlValida = (u) => { try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } };

// Cadastro de clientes. Autenticação: Authorization: Bearer $ADMIN_TOKEN.
function rotasAdmin({ cfg, store }) {
  const r = express.Router();
  r.use((req, res, next) => {
    const auth = req.get('authorization') || '';
    if (!cfg.adminToken || !igualSeguro(auth.replace(/^Bearer /, ''), cfg.adminToken)) {
      return res.status(401).json({ error: 'nao_autorizado' });
    }
    next();
  });
  const publico = ({ apiKeyHash, webhookSecret, ...c }) => ({ ...c, hasWebhookSecret: Boolean(webhookSecret) });

  r.get('/clients', assinc(async (_req, res) => {
    res.json((await store.listClients()).map(publico));
  }));

  // Cria cliente e devolve apiKey e webhookSecret UMA única vez.
  r.post('/clients', assinc(async (req, res) => {
    const { slug, name, roomPrefix, webhookUrl, recordingRetentionDays, transcriptionEnabled } = req.body || {};
    if (!SLUG_VALIDO.test(slug || '')) return res.status(400).json({ error: 'slug_invalido' });
    const prefixo = roomPrefix || `${slug}-`;
    if (!PREFIXO_VALIDO.test(prefixo)) return res.status(400).json({ error: 'room_prefix_invalido' });
    if (webhookUrl && !urlValida(webhookUrl)) return res.status(400).json({ error: 'webhook_url_invalida' });
    const apiKey = gerarApiKey();
    const webhookSecret = gerarSegredoWebhook();
    try {
      const c = await store.createClient({
        slug, name: String(name || slug).slice(0, 120), roomPrefix: prefixo,
        apiKeyHash: hashKey(apiKey), webhookUrl: webhookUrl || null, webhookSecret,
        recordingRetentionDays: Number.isInteger(recordingRetentionDays) ? recordingRetentionDays : 30,
        transcriptionEnabled: transcriptionEnabled === true,
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
    const c = await store.updateClient(req.params.slug, dados);
    if (!c) return res.status(404).json({ error: 'cliente_nao_encontrado' });
    res.json(publico(c));
  }));

  return r;
}

module.exports = { rotasAdmin };
