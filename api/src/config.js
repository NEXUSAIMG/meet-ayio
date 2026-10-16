// Configuração lida do ambiente (Railway Variables em produção, .env local).

// Seed do store em memória (dev/testes): "slug:chave:prefixo,slug2:chave2:prefixo2"
function lerSeedClientes(raw) {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const [slug, chave, prefixo] = item.split(':');
    return slug && chave ? { slug, apiKey: chave, roomPrefix: prefixo || `${slug}-` } : null;
  }).filter(Boolean);
}

function carregarConfig(env = process.env) {
  const jitsiDomain = (env.JITSI_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return {
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || '',
    adminToken: env.ADMIN_TOKEN || '',
    // Precisam bater com JWT_APP_ID / JWT_APP_SECRET / JWT_ACCEPTED_* do prosody.
    jwtAppId: env.JWT_APP_ID || 'meet-ayio',
    jwtAppSecret: env.JWT_APP_SECRET || '',
    jwtAudience: env.JWT_AUDIENCE || env.JWT_APP_ID || 'meet-ayio',
    // XMPP_DOMAIN do stack Jitsi (o template usa meet.jitsi).
    jitsiXmppDomain: env.JITSI_XMPP_DOMAIN || 'meet.jitsi',
    // Host público do serviço web do Jitsi, ex.: meet.ayio.com.br
    jitsiDomain,
    tokenTtlSeconds: Number(env.TOKEN_TTL_SECONDS) || 6 * 60 * 60,
    seedClientes: lerSeedClientes(env.MEET_AYIO_SEED_CLIENTS),
  };
}

module.exports = { carregarConfig, lerSeedClientes };
