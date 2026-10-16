const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

// Storage em disco (Railway Volume). Download por URL assinada servida pela própria API.
function criarLocalStorage({ dir, segredo, baseUrl = '' }) {
  const raiz = path.resolve(dir);
  const caminho = (key) => {
    const p = path.resolve(raiz, key);
    if (!p.startsWith(raiz + path.sep)) throw new Error('chave de storage inválida');
    return p;
  };
  const assinar = (dados) => crypto.createHmac('sha256', segredo).update(dados).digest('base64url');

  return {
    tipo: 'local',

    async put(key, stream) {
      const p = caminho(key);
      await fsp.mkdir(path.dirname(p), { recursive: true });
      const tmp = `${p}.part`;
      try {
        await pipeline(stream, fs.createWriteStream(tmp));
        await fsp.rename(tmp, p);
      } catch (e) {
        await fsp.rm(tmp, { force: true });
        throw e;
      }
      return { sizeBytes: (await fsp.stat(p)).size };
    },

    async delete(key) {
      await fsp.rm(caminho(key), { force: true });
    },

    async downloadUrl(key, ttlSec, { filename }) {
      const payload = Buffer.from(JSON.stringify({ k: key, e: Math.floor(Date.now() / 1000) + ttlSec, f: filename }))
        .toString('base64url');
      return `${baseUrl}/files/${payload}.${assinar(payload)}`;
    },

    // Usado pela rota /files/:token. Devolve null se assinatura inválida ou expirada.
    verificar(token) {
      const [payload, sig] = String(token || '').split('.');
      if (!payload || !sig) return null;
      const esperado = assinar(payload);
      if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
      try {
        const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return d.e >= Math.floor(Date.now() / 1000) ? { key: d.k, filename: d.f } : null;
      } catch {
        return null;
      }
    },

    // Caminho no disco para processar (ffmpeg). No storage local é o próprio arquivo.
    async paraArquivoLocal(key) {
      const p = caminho(key);
      await fsp.access(p);
      return p;
    },

    async abrir(key) {
      const p = caminho(key);
      const { size } = await fsp.stat(p);
      return { stream: fs.createReadStream(p), size };
    },
  };
}

module.exports = { criarLocalStorage };
