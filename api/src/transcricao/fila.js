const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Público do evento/rota (sem dados internos).
const transcricaoPublica = (t, gravacao) => ({
  recordingId: t.recordingId,
  roomName: gravacao?.roomName,
  status: t.status,
  language: t.language,
  durationSec: t.durationSec ?? null,
  text: t.text ?? null,
  segments: t.segments ?? null,
  minutes: t.minutes ?? null,
  minutesModel: t.minutesModel ?? null,
  error: t.error ?? null,
  updatedAt: new Date(t.updatedAt).toISOString(),
});

// Fila em processo, uma transcrição por vez (ffmpeg + Whisper pesam).
// O estado fica no banco: ao reiniciar, retomar() recoloca PENDING/PROCESSING na fila.
function criarFilaTranscricao({ cfg, store, storage, midia, transcritor, redator, notificador, agendar = setTimeout }) {
  let cadeia = Promise.resolve();
  const emAndamento = new Set();
  const naFila = new Set();
  let atual = null; // { id, desde } — monitoramento

  function enfileirar(id, atrasoMs = 0) {
    if (naFila.has(id)) return;
    naFila.add(id);
    const p = new Promise((resolve) => {
      agendar(() => {
        cadeia = cadeia
          .then(() => { naFila.delete(id); atual = { id, desde: new Date() }; return processar(id); }) // libera para uma retentativa reagendar
          .catch((e) => console.error('[transcricao]', e))
          .finally(() => { atual = null; resolve(); });
      }, atrasoMs);
    });
    emAndamento.add(p);
    p.finally(() => emAndamento.delete(p));
  }

  async function retomar() {
    for (const t of await store.listTranscriptsByStatus(['PENDING', 'PROCESSING'])) enfileirar(t.id);
  }

  // Quem recebeu token para a sala entre (início da gravação − 2 h) e o envio do arquivo.
  async function acessosDaGravacao(gravacao, duracaoSeg) {
    const fim = new Date(gravacao.createdAt);
    const inicio = new Date(fim.getTime() - ((duracaoSeg || gravacao.durationSec || 0) + 2 * 3600) * 1000);
    return store.listParticipantNames(gravacao.roomName, inicio, fim);
  }

  // No webhook vão texto e ata; os trechos com tempo (maiores) ficam no GET /transcript.
  async function avisar(evento, t, gravacao) {
    const cliente = await store.getClientById(t.clientId);
    const { segments, ...dados } = transcricaoPublica(t, gravacao);
    if (cliente) notificador.entregar({ cliente, evento, dados: { ...dados, segmentsCount: segments?.length || 0 } });
  }

  async function processar(id) {
    const t = await store.getTranscript(id);
    if (!t || t.status === 'DONE' || t.status === 'FAILED') return;
    const gravacao = await store.getRecording(t.recordingId);
    if (!gravacao || gravacao.status !== 'READY') {
      await store.updateTranscript(id, { status: 'FAILED', error: 'gravação não está mais disponível' });
      return;
    }
    if (!transcritor.configurado) {
      const falha = await store.updateTranscript(id, { status: 'FAILED', error: 'transcrição não configurada no servidor (TRANSCRIBE_API_KEY)' });
      await avisar('transcript.failed', falha, gravacao);
      return;
    }
    const tentativa = (t.attempts || 0) + 1;
    await store.updateTranscript(id, { status: 'PROCESSING', attempts: tentativa, error: null });

    const tmp = await fs.mkdtemp(path.join(cfg.tmpDir || os.tmpdir(), 'meet-ayio-tr-'));
    try {
      // 1) áudio em partes  2) Whisper em cada parte, ajustando os tempos
      const arquivo = await storage.paraArquivoLocal(gravacao.storageKey, tmp);
      const partes = await midia.extrairAudioEmPartes(arquivo, path.join(tmp, 'audio'), { segundos: cfg.audioChunkSeconds });
      const textos = [];
      const segmentos = [];
      for (const parte of partes) {
        const r = await transcritor.transcrever(parte.arquivo);
        if (r.texto) textos.push(r.texto);
        for (const s of r.segmentos) {
          segmentos.push({ start: +(s.start + parte.inicio).toFixed(2), end: +(s.end + parte.inicio).toFixed(2), text: s.text });
        }
      }
      const texto = textos.join('\n').trim();
      const duracao = Math.round(partes.reduce((a, p) => a + p.duracao, 0)) || gravacao.durationSec || null;
      await store.updateTranscript(id, { text: texto, segments: segmentos, durationSec: duracao });

      // 3) Rascunho de ata (falha aqui não perde a transcrição)
      let minutes = null;
      let minutesModel = null;
      let erroAta = null;
      if (!texto) {
        erroAta = 'sem fala detectada na gravação';
      } else if (!redator.configurado) {
        erroAta = 'ata não configurada no servidor (ANTHROPIC_API_KEY)';
      } else {
        try {
          const cliente = await store.getClientById(t.clientId);
          const sessao = await store.getSession(gravacao.roomName);
          const r = await redator.redigir({
            texto, segmentos,
            instrucoesCliente: cliente?.minutesPrompt,
            contexto: {
              sala: gravacao.roomName, titulo: sessao?.title, data: new Date(gravacao.createdAt).toISOString(), duracaoSeg: duracao,
              acessos: await acessosDaGravacao(gravacao, duracao),
            },
          });
          minutes = r.ata;
          minutesModel = r.modelo;
        } catch (e) {
          erroAta = `ata: ${e.message}`.slice(0, 500);
        }
      }
      const pronta = await store.updateTranscript(id, { status: 'DONE', minutes, minutesModel, error: erroAta });
      await avisar('transcript.ready', pronta, gravacao);
    } catch (e) {
      const ultima = tentativa >= cfg.transcriptionMaxAttempts;
      const atual = await store.updateTranscript(id, { status: ultima ? 'FAILED' : 'PENDING', error: String(e.message).slice(0, 500) });
      if (ultima) await avisar('transcript.failed', atual, gravacao);
      else enfileirar(id, cfg.transcriptionRetryDelayMs * tentativa);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Gera (de novo) só a ata, com participantes/instruções vindos do cliente. Síncrono.
  async function regerarAta({ transcricao, gravacao, cliente, participantes, instrucoes, titulo }) {
    if (!redator.configurado) throw Object.assign(new Error('ata não configurada no servidor'), { code: 'NAO_CONFIGURADO' });
    const sessao = await store.getSession(gravacao.roomName);
    const r = await redator.redigir({
      texto: transcricao.text, segmentos: transcricao.segments,
      instrucoesCliente: cliente.minutesPrompt, instrucoesExtras: instrucoes,
      contexto: {
        sala: gravacao.roomName, titulo: titulo || sessao?.title, participantes,
        acessos: participantes ? undefined : await acessosDaGravacao(gravacao, transcricao.durationSec),
        data: new Date(gravacao.createdAt).toISOString(), duracaoSeg: transcricao.durationSec,
      },
    });
    return store.updateTranscript(transcricao.id, { minutes: r.ata, minutesModel: r.modelo, error: null });
  }

  async function aguardar() {
    while (emAndamento.size) await Promise.all([...emAndamento]);
    await cadeia;
  }

  // Recusa sem processar (ex.: quota do mês atingida) e avisa o cliente.
  async function falhar(id, erro) {
    const t = await store.updateTranscript(id, { status: 'FAILED', error: String(erro).slice(0, 500) });
    const gravacao = t && await store.getRecording(t.recordingId);
    if (t) await avisar('transcript.failed', t, gravacao);
    return t;
  }

  // Monitoramento: o que está na memória do processo agora.
  const estado = () => ({
    waiting: naFila.size,
    processing: atual ? { transcriptId: atual.id, forSec: Math.round((Date.now() - atual.desde) / 1000) } : null,
  });

  return { enfileirar, retomar, regerarAta, aguardar, falhar, estado };
}

module.exports = { criarFilaTranscricao, transcricaoPublica };
