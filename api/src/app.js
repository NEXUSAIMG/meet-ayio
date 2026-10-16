const express = require('express');
const { rotasAdmin } = require('./routes/admin');
const { rotasApi } = require('./routes/api');
const { rotasInternas, rotasArquivos } = require('./routes/internal');

// deps: { cfg, store, storage, notificador }
function criarApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Para monitor externo (UptimeRobot etc.): só diz se o banco responde, sem detalhes.
  // O relatório completo fica em GET /admin/health (com ADMIN_TOKEN).
  app.get('/health/ready', async (_req, res) => {
    try {
      await deps.store.ping();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Upload do Jibri vem em stream (sem parser JSON).
  app.use('/internal', rotasInternas(deps));
  if (deps.storage.tipo === 'local') app.use('/files', rotasArquivos(deps));

  app.use(express.json({ limit: '100kb' }));
  app.use('/admin', rotasAdmin(deps));
  app.use('/api/v1', rotasApi(deps));

  app.use((_req, res) => res.status(404).json({ error: 'rota_nao_encontrada' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'json_invalido' });
    console.error('[meet-ayio-api]', err);
    res.status(500).json({ error: 'erro_interno' });
  });
  return app;
}

module.exports = { criarApp };
