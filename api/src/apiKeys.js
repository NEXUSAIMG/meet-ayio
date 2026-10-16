const crypto = require('crypto');

// API key dos clientes: mostrada UMA vez na criação; no banco só fica o hash.
const gerarApiKey = () => 'mak_' + crypto.randomBytes(24).toString('base64url');
const hashKey = (chave) => crypto.createHash('sha256').update(String(chave)).digest('hex');

// Comparação em tempo constante (token de admin).
function igualSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb) && Boolean(a);
}

module.exports = { gerarApiKey, hashKey, igualSeguro };
