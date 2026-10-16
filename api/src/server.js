const { carregarConfig } = require('./config');
const { criarApp } = require('./app');

const cfg = carregarConfig();
if (!cfg.jwtAppSecret) console.warn('[meet-ayio-api] JWT_APP_SECRET vazio: emissão de token vai falhar');
if (cfg.apiKeys.size === 0) console.warn('[meet-ayio-api] MEET_AYIO_API_KEYS vazio: nenhum cliente consegue autenticar');

criarApp(cfg).listen(cfg.port, () => console.log(`[meet-ayio-api] ouvindo na porta ${cfg.port}`));
