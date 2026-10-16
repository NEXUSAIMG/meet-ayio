// Transcrição + ata: ffmpeg REAL, transcritor/redator REAIS falando com servidores falsos
// (Groq e Anthropic simulados), fila e rotas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { comServidor, req, post, receptorWebhook, servidorFalso } = require('./helpers');
const { criarTranscritor } = require('../src/transcricao/transcritor');
const { criarRedator } = require('../src/transcricao/redator');
const { verificarAssinatura } = require('../src/webhooks');

let temFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { temFfmpeg = false; }
const pular = !temFfmpeg && 'ffmpeg não encontrado no PATH';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-ayio-midia-'));
const VIDEO = path.join(DIR, 'reuniao.mp4'); // 150 s com áudio → 3 partes de 60 s
const MUDO = path.join(DIR, 'mudo.mp4'); // sem faixa de áudio
test.before(() => {
  if (!temFfmpeg) return;
  const lavfi = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'ignore' });
  lavfi(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000',
    '-t', '150', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', VIDEO]);
  lavfi(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', MUDO]);
});
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const ATA = 'RASCUNHO DE ATA (gerado por IA — revisar)\n1. IDENTIFICAÇÃO ...';

// Groq falso: verbose_json com um segmento por parte. falhas = respostas 500 iniciais.
async function groqFalso({ falhas = 0, sempreFalha = false } = {}) {
  let ok = 0;
  return servidorFalso((_rq, corpo) => {
    const txt = corpo.toString('latin1');
    if (sempreFalha || falhas-- > 0) return { status: 500, json: { error: { message: 'instável' } } };
    assert.match(txt, /name="model"\r\n\r\nwhisper-large-v3-turbo/);
    assert.match(txt, /name="response_format"\r\n\r\nverbose_json/);
    assert.match(txt, /name="file"; filename="parte-\d{3}\.mp3"/);
    ok++;
    return { json: { text: `fala da parte ${ok}`, segments: [{ start: 1, end: 4, text: ` fala da parte ${ok}` }] } };
  });
}
const anthropicFalso = (status = 200) => servidorFalso(() => (status === 200
  ? { json: { model: 'claude-teste', content: [{ type: 'text', text: ATA }] } }
  : { status, json: { error: { message: 'sobrecarregado' } } }));

const transcritorPara = (s) => criarTranscritor({ url: `${s.url}/audio/transcriptions`, apiKey: 'gk', modelo: 'whisper-large-v3-turbo', pausaMs: 5 });
const redatorPara = (s) => criarRedator({ apiKey: 'ak', modelo: 'claude-teste', apiUrl: `${s.url}/v1/messages` });
const ENV = { AUDIO_CHUNK_SECONDS: '60', TRANSCRIPTION_RETRY_DELAY_MS: '10', TRANSCRIPTION_MAX_ATTEMPTS: '2' };

async function clienteComGravacao(base, { webhookUrl, transcriptionEnabled = true, arquivo = VIDEO } = {}) {
  const c = await (await post(base, '/admin/clients', {
    admin: 'admin-teste', body: { slug: 'cart', roomPrefix: 'ct-', webhookUrl, transcriptionEnabled },
  })).json();
  await post(base, '/api/v1/tokens', { key: c.apiKey, body: { room: 'ct-reuniao', user: { name: 'Mod' }, moderator: true } });
  await post(base, '/api/v1/tokens', { key: c.apiKey, body: { room: 'ct-reuniao', user: { name: 'Davi' } } });
  await post(base, '/api/v1/tokens', { key: c.apiKey, body: { room: 'ct-reuniao', user: { name: 'davi ' } } }); // reentrou
  const up = await req(base, 'PUT', '/internal/recordings?room=ct-reuniao&durationSec=150', {
    bearer: 'recorder-teste', raw: fs.readFileSync(arquivo), headers: { 'content-type': 'video/mp4' },
  });
  assert.strictEqual(up.status, 201);
  return { c, gravacao: await up.json() };
}

test('fluxo automático: ffmpeg corta em partes, Whisper transcreve, IA redige, webhook avisa', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso();
  const hook = await receptorWebhook();
  try {
    await comServidor(async ({ base, fila, notificador }) => {
      const { c, gravacao } = await clienteComGravacao(base, { webhookUrl: hook.url });
      assert.strictEqual(gravacao.transcription, 'PENDING');
      await fila.aguardar();
      await notificador.aguardar();

      assert.strictEqual(groq.recebidos.length, 3, '150 s em partes de 60 s = 3 chamadas');
      const t = await (await req(base, 'GET', `/api/v1/recordings/${gravacao.id}/transcript`, { key: c.apiKey })).json();
      assert.strictEqual(t.status, 'DONE');
      assert.strictEqual(t.text, 'fala da parte 1\nfala da parte 2\nfala da parte 3');
      // tempos ajustados pelo início de cada parte (0, 60, 120 s)
      assert.deepStrictEqual(t.segments.map((s) => Math.round(s.start)), [1, 61, 121]);
      assert.ok(Math.abs(t.durationSec - 150) <= 1, `duração ${t.durationSec}`);
      assert.strictEqual(t.minutes, ATA);
      assert.strictEqual(t.minutesModel, 'claude-teste');

      // pedido à IA: cabeçalhos, regras e transcrição com marcas de tempo
      const pedido = JSON.parse(claude.recebidos[0].corpo.toString());
      assert.strictEqual(claude.recebidos[0].headers['x-api-key'], 'ak');
      assert.strictEqual(claude.recebidos[0].headers['anthropic-version'], '2023-06-01');
      assert.strictEqual(pedido.model, 'claude-teste');
      assert.match(pedido.system, /Fidelidade total/);
      assert.match(pedido.system, /NÃO identifica quem fala/);
      assert.match(pedido.system, /ASSUNTOS TRATADOS/, 'formato padrão');
      assert.match(pedido.messages[0].content, /\[01:01\] fala da parte 2/);
      assert.match(pedido.messages[0].content, /Sala: ct-reuniao/);
      // participantes vindos dos tokens emitidos (moderador marcado, sem repetir)
      assert.match(pedido.messages[0].content, /Pessoas que receberam acesso à sala \(pelo sistema; alguém pode não ter entrado\): Mod \(moderador\); Davi$/m);

      const ev = hook.recebidos.find((r) => r.headers['x-meetayio-event'] === 'transcript.ready');
      assert.ok(ev, 'webhook transcript.ready');
      assert.ok(verificarAssinatura(c.webhookSecret, ev.corpo, ev.headers['x-meetayio-signature']));
      const dados = JSON.parse(ev.corpo).data;
      assert.deepStrictEqual([dados.recordingId, dados.roomName, dados.minutes], [gravacao.id, 'ct-reuniao', ATA]);
      assert.strictEqual(dados.segments, undefined, 'trechos ficam fora do webhook');
      assert.strictEqual(dados.segmentsCount, 3);
      assert.ok(dados.text);

      const u = await (await req(base, 'GET', '/api/v1/usage', { key: c.apiKey })).json();
      assert.ok(u.transcribedMinutes >= 2 && u.transcribedMinutes <= 3, `transcribedMinutes ${u.transcribedMinutes}`);
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar(), hook.fechar()]);
  }
});

test('regerar ata com participantes, instruções e prompt próprio do cliente', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso();
  try {
    await comServidor(async ({ base, fila }) => {
      const { c, gravacao } = await clienteComGravacao(base);
      await fila.aguardar();
      await req(base, 'PATCH', '/admin/clients/cart', { admin: 'admin-teste', body: { minutesPrompt: 'Formato do cartório: TERMO DE ATENDIMENTO.' } });
      const r = await post(base, `/api/v1/recordings/${gravacao.id}/minutes`, {
        key: c.apiKey, body: { participants: ['Karina (atendente)', 'Davi (cliente)'], instructions: 'Destacar documentos pedidos.', title: 'Escritura' },
      });
      assert.strictEqual(r.status, 200);
      const pedido = JSON.parse(claude.recebidos.at(-1).corpo.toString());
      assert.match(pedido.system, /Fidelidade total/, 'regras continuam valendo');
      assert.match(pedido.system, /TERMO DE ATENDIMENTO/, 'prompt do cliente');
      assert.doesNotMatch(pedido.system, /ASSUNTOS TRATADOS/, 'prompt do cliente substitui o formato padrão');
      assert.match(pedido.messages[0].content, /Participantes informados: Karina \(atendente\); Davi \(cliente\)/);
      assert.match(pedido.messages[0].content, /Destacar documentos pedidos/);
      assert.match(pedido.messages[0].content, /Título: Escritura/);
      assert.strictEqual(groq.recebidos.length, 3, 'não retranscreve');
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar()]);
  }
});

test('IA fora do ar: transcrição fica pronta e a ata pode ser pedida depois', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso(529);
  try {
    await comServidor(async ({ base, fila }) => {
      const { c, gravacao } = await clienteComGravacao(base);
      await fila.aguardar();
      const t = await (await req(base, 'GET', `/api/v1/recordings/${gravacao.id}/transcript`, { key: c.apiKey })).json();
      assert.strictEqual(t.status, 'DONE');
      assert.ok(t.text);
      assert.strictEqual(t.minutes, null);
      assert.match(t.error, /^ata: IA HTTP 529/);
      assert.strictEqual((await post(base, `/api/v1/recordings/${gravacao.id}/minutes`, { key: c.apiKey })).status, 502);
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar()]);
  }
});

test('Whisper instável: retenta; falha permanente vira FAILED com webhook transcript.failed', { skip: pular }, async () => {
  const instavel = await groqFalso({ falhas: 2 }); // 2 × 500 e depois ok (retentativa dentro do transcritor)
  const quebrado = await groqFalso({ sempreFalha: true });
  const claude = await anthropicFalso();
  const hook = await receptorWebhook();
  try {
    await comServidor(async ({ base, fila }) => {
      const { c, gravacao } = await clienteComGravacao(base);
      await fila.aguardar();
      assert.strictEqual((await (await req(base, 'GET', `/api/v1/recordings/${gravacao.id}/transcript`, { key: c.apiKey })).json()).status, 'DONE');
      void c;
    }, { env: ENV, transcritor: transcritorPara(instavel), redator: redatorPara(claude) });

    await comServidor(async ({ base, fila, notificador, store }) => {
      const { c, gravacao } = await clienteComGravacao(base, { webhookUrl: hook.url });
      await fila.aguardar();
      await notificador.aguardar();
      const t = await store.getTranscriptByRecording(gravacao.id);
      assert.deepStrictEqual([t.status, t.attempts], ['FAILED', 2]);
      assert.match(t.error, /transcrição HTTP 500/);
      const ev = hook.recebidos.find((r) => r.headers['x-meetayio-event'] === 'transcript.failed');
      assert.ok(ev && JSON.parse(ev.corpo).data.status === 'FAILED');
      // pedir de novo (endpoint voltou? aqui continua quebrado, mas o pedido é aceito)
      assert.strictEqual((await post(base, `/api/v1/recordings/${gravacao.id}/transcript`, { key: c.apiKey })).status, 202);
    }, { env: ENV, transcritor: transcritorPara(quebrado), redator: redatorPara(claude) });
  } finally {
    await Promise.all([instavel.fechar(), quebrado.fechar(), claude.fechar(), hook.fechar()]);
  }
});

test('vídeo sem áudio: DONE sem texto e sem chamar Whisper nem IA', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso();
  try {
    await comServidor(async ({ base, fila, store }) => {
      const { gravacao } = await clienteComGravacao(base, { arquivo: MUDO });
      await fila.aguardar();
      const t = await store.getTranscriptByRecording(gravacao.id);
      assert.deepStrictEqual([t.status, t.text, t.error], ['DONE', '', 'sem fala detectada na gravação']);
      assert.strictEqual(groq.recebidos.length + claude.recebidos.length, 0);
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar()]);
  }
});

test('automático desligado: nada acontece até o cliente pedir; apagar gravação apaga a ata', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso();
  try {
    await comServidor(async ({ base, fila }) => {
      const { c, gravacao } = await clienteComGravacao(base, { transcriptionEnabled: false });
      assert.strictEqual(gravacao.transcription, 'OFF');
      await fila.aguardar();
      assert.strictEqual(groq.recebidos.length, 0);
      const url = `/api/v1/recordings/${gravacao.id}/transcript`;
      assert.strictEqual((await req(base, 'GET', url, { key: c.apiKey })).status, 404);
      assert.strictEqual((await post(base, `/api/v1/recordings/${gravacao.id}/minutes`, { key: c.apiKey })).status, 409);

      assert.strictEqual((await post(base, url, { key: c.apiKey })).status, 202);
      await fila.aguardar();
      assert.strictEqual((await (await req(base, 'GET', url, { key: c.apiKey })).json()).status, 'DONE');
      assert.strictEqual((await post(base, url, { key: c.apiKey })).status, 409, 'já transcrita');
      assert.strictEqual((await req(base, 'GET', url, { key: 'chave-sc' })).status, 404, 'outro cliente não vê');

      assert.strictEqual((await req(base, 'DELETE', `/api/v1/recordings/${gravacao.id}`, { key: c.apiKey })).status, 204);
      assert.strictEqual((await req(base, 'GET', url, { key: c.apiKey })).status, 404, 'ata apagada junto (LGPD)');
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar()]);
  }
});

test('reinício: transcrição que estava PROCESSING é retomada', { skip: pular }, async () => {
  const groq = await groqFalso();
  const claude = await anthropicFalso();
  try {
    await comServidor(async ({ base, fila, store }) => {
      const { c, gravacao } = await clienteComGravacao(base, { transcriptionEnabled: false });
      const t = await store.createTranscript({ recordingId: gravacao.id, clientId: (await store.getRecording(gravacao.id)).clientId });
      await store.updateTranscript(t.id, { status: 'PROCESSING', attempts: 1 }); // "caiu" no meio
      await fila.retomar();
      await fila.aguardar();
      const fim = await store.getTranscript(t.id);
      assert.deepStrictEqual([fim.status, fim.attempts], ['DONE', 2]);
      void c;
    }, { env: ENV, transcritor: transcritorPara(groq), redator: redatorPara(claude) });
  } finally {
    await Promise.all([groq.fechar(), claude.fechar()]);
  }
});

test('midia: duração múltipla do corte não gera parte vazia no fim', { skip: pular }, async () => {
  const { criarMidia } = require('../src/transcricao/midia');
  const m = criarMidia();
  const exato = path.join(DIR, 'exato.mp4'); // 120 s, cortes de 60 s
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=16000',
    '-t', '120', '-c:a', 'aac', exato], { stdio: 'ignore' });
  const partes = await m.extrairAudioEmPartes(exato, path.join(DIR, 'exato-partes'), { segundos: 60 });
  assert.strictEqual(partes.length, 2, partes.map((p) => p.duracao).join(', '));
  assert.ok(partes.every((p) => p.duracao > 59));
  assert.deepStrictEqual(await m.extrairAudioEmPartes(MUDO, path.join(DIR, 'mudo-partes')), []);
});

test('nomes dos tokens: só os da janela da gravação; retenção apaga os antigos', async () => {
  const { criarMemoryStore } = require('../src/stores/memoryStore');
  const { executarRetencao } = require('../src/retention');
  const store = criarMemoryStore({ seedClientes: [{ slug: 'x', apiKey: 'k', roomPrefix: 'x-' }] });
  const [c] = await store.listClients();
  await store.recordToken({ clientId: c.id, roomName: 'x-sala', moderator: false, userName: 'Antiga' });
  store._envelhecerTokens(5 * 3600 * 1000); // 5 h atrás: fora da janela de uma reunião de 1 h
  await store.recordToken({ clientId: c.id, roomName: 'x-sala', moderator: true, userName: 'Karina' });
  await store.recordToken({ clientId: c.id, roomName: 'x-outra', moderator: false, userName: 'Outra sala' });
  const agora = new Date();
  assert.deepStrictEqual(await store.listParticipantNames('x-sala', new Date(agora - 3 * 3600 * 1000), agora), ['Karina (moderador)']);

  store._envelhecerTokens(91 * 86_400_000);
  await executarRetencao({ store, storage: { delete: async () => {} }, diasNomesTokens: 90 });
  assert.deepStrictEqual(await store.listParticipantNames('x-sala', new Date(0), new Date()), [], 'nomes apagados após 90 dias');
});

test('servidor sem chave de transcrição: FAILED com motivo claro', { skip: pular }, async () => {
  await comServidor(async ({ base, fila, store }) => {
    const { gravacao } = await clienteComGravacao(base);
    await fila.aguardar();
    const t = await store.getTranscriptByRecording(gravacao.id);
    assert.strictEqual(t.status, 'FAILED');
    assert.match(t.error, /TRANSCRIBE_API_KEY/);
  }, { env: ENV });
});
