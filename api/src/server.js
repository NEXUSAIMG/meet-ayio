const { carregarConfig } = require('./config');
const { criarApp } = require('./app');
const { criarMemoryStore } = require('./stores/memoryStore');
const { criarStorage } = require('./storage');
const { criarNotificador } = require('./webhooks');
const { executarRetencao } = require('./retention');

const cfg = carregarConfig();
const avisar = (msg) => console.warn(`[meet-ayio-api] ${msg}`);

let store;
if (cfg.databaseUrl) {
  const { PrismaClient } = require('@prisma/client');
  const { criarPrismaStore } = require('./stores/prismaStore');
  store = criarPrismaStore(new PrismaClient());
} else {
  avisar('DATABASE_URL vazio: usando store em memória (dados somem ao reiniciar)');
  store = criarMemoryStore({ seedClientes: cfg.seedClientes });
}
const storage = criarStorage(cfg);
const notificador = criarNotificador({ store, delaysMs: cfg.webhookDelaysMs, timeoutMs: cfg.webhookTimeoutMs });

if (!cfg.jwtAppSecret) avisar('JWT_APP_SECRET vazio: emissão de token vai falhar');
if (!cfg.adminToken) avisar('ADMIN_TOKEN vazio: rotas /admin desativadas');
if (!cfg.recorderSecret) avisar('RECORDER_SECRET vazio: upload de gravações desativado');
if (!cfg.jitsiDomain) avisar('JITSI_DOMAIN vazio: respostas sem domain/scriptUrl');
if (storage.tipo === 'local') {
  if (!cfg.filesSecret) avisar('FILES_SECRET/JWT_APP_SECRET vazio: links de download inseguros');
  if (!cfg.publicUrl) avisar('PUBLIC_URL vazio: links de download serão relativos');
}

const retencao = () => executarRetencao({ store, storage })
  .then((n) => n && console.log(`[meet-ayio-api] retenção: ${n} gravação(ões) apagada(s)`))
  .catch((e) => console.error('[meet-ayio-api] retenção falhou', e));
setInterval(retencao, cfg.retentionIntervalMs).unref();
setTimeout(retencao, 10_000).unref();

const servidor = criarApp({ cfg, store, storage, notificador }).listen(cfg.port, () =>
  console.log(`[meet-ayio-api] ouvindo na porta ${cfg.port} (storage: ${storage.tipo})`));
// Atrás do proxy do Railway: keep-alive maior que o do proxy evita conexões
// resetadas (o padrão do Node, 5 s, causa ECONNRESET/502 intermitente).
servidor.keepAliveTimeout = 65_000;
servidor.headersTimeout = 66_000;
servidor.requestTimeout = 0; // uploads grandes do Jibri não podem ser cortados
