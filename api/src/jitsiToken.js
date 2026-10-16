const jwt = require('jsonwebtoken');

// JWT no formato aceito pelo prosody do Jitsi (AUTH_TYPE=jwt, HS256).
// Mesmo modelo de claims que o gerarToken do SeuCartório usa com o JaaS
// (context.user, context.features, room), sem os campos próprios da 8x8.
function gerarTokenJitsi(cfg, { room, user = {}, moderator = false, features = {} }) {
  if (!cfg.jwtAppSecret) throw new Error('JWT_APP_SECRET não configurado');
  if (!room) throw new Error('room é obrigatório');

  const agora = Math.floor(Date.now() / 1000);
  const payload = {
    aud: cfg.jwtAudience,
    iss: cfg.jwtAppId,
    sub: cfg.jitsiXmppDomain,
    room,
    nbf: agora - 10,
    exp: agora + cfg.tokenTtlSeconds,
    moderator: Boolean(moderator),
    context: {
      user: {
        id: user.id ? String(user.id) : undefined,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        moderator: Boolean(moderator),
        affiliation: moderator ? 'owner' : 'member',
      },
      features: {
        recording: Boolean(features.recording),
        livestreaming: false,
        transcription: false,
        'outbound-call': false,
      },
    },
  };
  return jwt.sign(payload, cfg.jwtAppSecret, { algorithm: 'HS256' });
}

module.exports = { gerarTokenJitsi };
