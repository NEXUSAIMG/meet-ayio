const { carregarConfig } = require('./config');
const { criarApp } = require('./app');
const { criarMemoryStore } = require('./stores/memoryStore');

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
if (!cfg.jwtAppSecret) avisar('JWT_APP_SECRET vazio: emissão de token vai falhar');
if (!cfg.adminToken) avisar('ADMIN_TOKEN vazio: rotas /admin desativadas');
if (!cfg.jitsiDomain) avisar('JITSI_DOMAIN vazio: respostas sem domain/scriptUrl');

criarApp(cfg, store).listen(cfg.port, () => console.log(`[meet-ayio-api] ouvindo na porta ${cfg.port}`));
