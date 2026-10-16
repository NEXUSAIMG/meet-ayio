// Configuração lida do ambiente (Railway Variables em produção, .env local).

// Seed do store em memória (dev/testes): "slug:chave:prefixo,slug2:chave2:prefixo2"
function lerSeedClientes(raw) {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const [slug, chave, prefixo] = item.split(':');
    return slug && chave ? { slug, apiKey: chave, roomPrefix: prefixo || `${slug}-` } : null;
  }).filter(Boolean);
}

const lista = (raw, padrao) => (raw ? String(raw).split(',').map(Number).filter((n) => n >= 0) : padrao);

function carregarConfig(env = process.env) {
  const jitsiDomain = (env.JITSI_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return {
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || '',
    adminToken: env.ADMIN_TOKEN || '',
    // URL pública desta API (links de download do storage local). Ex.: https://api.meet.ayio.com.br
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),

    // Precisam bater com JWT_APP_ID / JWT_APP_SECRET / JWT_ACCEPTED_* do prosody.
    jwtAppId: env.JWT_APP_ID || 'meet-ayio',
    jwtAppSecret: env.JWT_APP_SECRET || '',
    jwtAudience: env.JWT_AUDIENCE || env.JWT_APP_ID || 'meet-ayio',
    jitsiXmppDomain: env.JITSI_XMPP_DOMAIN || 'meet.jitsi', // XMPP_DOMAIN do stack
    jitsiDomain, // host público do web do Jitsi, ex.: meet.ayio.com.br
    tokenTtlSeconds: Number(env.TOKEN_TTL_SECONDS) || 6 * 60 * 60,

    // Gravações
    recorderSecret: env.RECORDER_SECRET || '', // usado pelo script de finalização do Jibri
    recordingsDir: env.RECORDINGS_DIR || './data/recordings',
    filesSecret: env.FILES_SECRET || env.JWT_APP_SECRET || '',
    downloadTtlSeconds: Number(env.DOWNLOAD_TTL_SECONDS) || 15 * 60,
    s3: {
      bucket: env.S3_BUCKET || '',
      endpoint: env.S3_ENDPOINT || '',
      region: env.S3_REGION || 'auto',
      accessKeyId: env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: env.S3_FORCE_PATH_STYLE === '1',
    },

    // Webhooks: atrasos das tentativas (ms). Padrão: na hora, 30 s, 5 min, 30 min.
    webhookDelaysMs: lista(env.WEBHOOK_DELAYS_MS, [0, 30_000, 300_000, 1_800_000]),
    webhookTimeoutMs: Number(env.WEBHOOK_TIMEOUT_MS) || 10_000,
    retentionIntervalMs: Number(env.RETENTION_INTERVAL_MS) || 60 * 60 * 1000,

    seedClientes: lerSeedClientes(env.MEET_AYIO_SEED_CLIENTS),
  };
}

module.exports = { carregarConfig, lerSeedClientes };
