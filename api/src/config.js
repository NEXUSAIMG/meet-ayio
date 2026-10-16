// Configuração lida do ambiente (Railway Variables em produção, .env local).

function lerApiKeys(raw) {
  // Formato: "seucartorio:chave1,botayio:chave2"  → Map(chave → cliente)
  const mapa = new Map();
  for (const par of (raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = par.indexOf(':');
    if (i <= 0) continue;
    mapa.set(par.slice(i + 1), par.slice(0, i));
  }
  return mapa;
}

function carregarConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    // Precisam bater com JWT_APP_ID / JWT_APP_SECRET / JWT_ACCEPTED_* do prosody.
    jwtAppId: env.JWT_APP_ID || 'meet-ayio',
    jwtAppSecret: env.JWT_APP_SECRET || '',
    jwtAudience: env.JWT_AUDIENCE || env.JWT_APP_ID || 'meet-ayio',
    // XMPP_DOMAIN do stack Jitsi (o template usa meet.jitsi).
    jitsiXmppDomain: env.JITSI_XMPP_DOMAIN || 'meet.jitsi',
    // URL pública do serviço web do Jitsi, ex.: https://meet.ayio.com.br
    jitsiPublicUrl: (env.JITSI_PUBLIC_URL || '').replace(/\/$/, ''),
    tokenTtlSeconds: Number(env.TOKEN_TTL_SECONDS) || 2 * 60 * 60,
    apiKeys: lerApiKeys(env.MEET_AYIO_API_KEYS),
  };
}

module.exports = { carregarConfig, lerApiKeys };
