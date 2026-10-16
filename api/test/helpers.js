// Monta a API com store em memória, storage local temporário e notificador rápido.
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const { carregarConfig } = require('../src/config');
const { criarApp } = require('../src/app');
const { criarMemoryStore } = require('../src/stores/memoryStore');
const { criarLocalStorage } = require('../src/storage/local');
const { criarNotificador } = require('../src/webhooks');
const { criarMidia } = require('../src/transcricao/midia');
const { criarFilaTranscricao } = require('../src/transcricao/fila');

const ENV = {
  JWT_APP_ID: 'meet-ayio',
  JWT_APP_SECRET: 'segredo-de-teste',
  JITSI_DOMAIN: 'https://meet.exemplo.com/',
  ADMIN_TOKEN: 'admin-teste',
  RECORDER_SECRET: 'recorder-teste',
  MEET_AYIO_SEED_CLIENTS: 'seucartorio:chave-sc:sc-,botayio:chave-bot:bot-',
};

const desligado = { configurado: false };

async function comServidor(fn, { env = {}, delaysMs = [0], transcritor = desligado, redator = desligado } = {}) {
  const cfg = carregarConfig({ ...ENV, ...env });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-ayio-test-'));
  const store = criarMemoryStore({ seedClientes: cfg.seedClientes });
  const servidor = http.createServer();
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const storage = criarLocalStorage({ dir, segredo: 'segredo-arquivos', baseUrl: base });
  const notificador = criarNotificador({ store, delaysMs, timeoutMs: 2000 });
  const midia = criarMidia({ ffmpeg: cfg.ffmpegPath, ffprobe: cfg.ffprobePath });
  const fila = criarFilaTranscricao({ cfg: { ...cfg, tmpDir: dir }, store, storage, midia, transcritor, redator, notificador });
  servidor.on('request', criarApp({ cfg, store, storage, notificador, fila }));
  try {
    await fn({ base, store, storage, notificador, fila, cfg, dir });
  } finally {
    await fila.aguardar();
    await notificador.aguardar();
    await new Promise((r) => servidor.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const req = (base, metodo, p, { key, admin, bearer, body, raw, headers = {} } = {}) => fetch(base + p, {
  method: metodo,
  headers: {
    ...(raw === undefined ? { 'content-type': 'application/json' } : {}),
    ...(key ? { 'x-api-key': key } : {}),
    ...(admin ? { authorization: `Bearer ${admin}` } : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    ...headers,
  },
  body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
});
const post = (base, p, opts) => req(base, 'POST', p, opts);
const lerJwt = (t) => jwt.verify(t, 'segredo-de-teste', { algorithms: ['HS256'], audience: 'meet-ayio', issuer: 'meet-ayio' });

// Servidor genérico de teste: guarda as requisições e responde com `responder(req, corpoBuffer, n)`.
async function servidorFalso(responder) {
  const recebidos = [];
  const srv = http.createServer((rq, rs) => {
    const partes = [];
    rq.on('data', (c) => partes.push(c));
    rq.on('end', async () => {
      const corpo = Buffer.concat(partes);
      recebidos.push({ headers: rq.headers, corpo, url: rq.url });
      const { status = 200, json } = (await responder(rq, corpo, recebidos.length)) || {};
      rs.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json ?? {}));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, recebidos, fechar: () => new Promise((r) => srv.close(r)) };
}

// Receptor de webhooks: recebidos = [{ headers, corpo (string) }].
// falhasIniciais = quantas respostas 500 antes do 200.
async function receptorWebhook({ falhasIniciais = 0 } = {}) {
  const recebidos = [];
  let falhas = falhasIniciais;
  const srv = http.createServer((rq, rs) => {
    let corpo = '';
    rq.on('data', (c) => { corpo += c; });
    rq.on('end', () => {
      recebidos.push({ headers: rq.headers, corpo });
      if (falhas > 0) { falhas--; rs.writeHead(500).end(); } else rs.writeHead(200).end('ok');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/hook`, recebidos, fechar: () => new Promise((r) => srv.close(r)) };
}

module.exports = { comServidor, req, post, lerJwt, receptorWebhook, servidorFalso };
