// Saúde da API para o painel e para monitores externos.
// status: "ok" | "degraded" (funciona, mas algo pede atenção) | "down" (banco fora).

const MIN = 60_000;
const HORA = 60 * MIN;
const { version } = require('../package.json');

const LIMITES = {
  filaParadaMin: 60, // transcrição pendente há mais que isto = fila travada ou lenta demais
  transcricaoFalhaHoras: 24,
  webhookFalhaDias: 7,
};

async function cronometrar(fn) {
  const t0 = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(e.message || e).slice(0, 200) };
  }
}

async function verificarSaude({ cfg, store, storage, notificador, fila, agora = new Date() }) {
  const problemas = [];
  const database = await cronometrar(() => store.ping());
  if (!database.ok) {
    return { status: 'down', checkedAt: agora.toISOString(), version, database, problems: ['banco de dados inacessível'] };
  }

  // ---------- Transcrição ----------
  const configurada = Boolean(cfg.transcribe?.apiKey);
  const ataConfigurada = Boolean(cfg.minutes?.apiKey);
  const { byStatus, oldestPendingAt } = await store.transcriptStats();
  const pendenteMin = oldestPendingAt ? Math.round((agora - new Date(oldestPendingAt)) / MIN) : null;
  const falhasTr = await store.listFailedTranscripts({ since: new Date(agora - LIMITES.transcricaoFalhaHoras * HORA), limit: 20 });
  if (pendenteMin != null && pendenteMin > LIMITES.filaParadaMin) {
    problemas.push(`transcrição pendente há ${pendenteMin} min`);
  }
  if (falhasTr.length) problemas.push(`${falhasTr.length} transcrição(ões) falharam nas últimas ${LIMITES.transcricaoFalhaHoras} h`);
  if (!configurada && (byStatus.PENDING || byStatus.PROCESSING)) problemas.push('há transcrições na fila, mas TRANSCRIBE_API_KEY não está configurada');

  // ---------- Webhooks ----------
  const memoria = notificador.estatisticas();
  const gravFalhas = await store.listRecordingsByWebhookStatus(['FAILED'], { since: new Date(agora - LIMITES.webhookFalhaDias * 24 * HORA), limit: 20 });
  const gravPendentes = await store.listRecordingsByWebhookStatus(['PENDING'], { limit: 50 });
  // PENDING com mais de 1 h: o processo reiniciou no meio das retentativas (elas vivem em memória).
  const pendentesPresos = gravPendentes.filter((g) => agora - new Date(g.createdAt) > HORA);
  if (gravFalhas.length) problemas.push(`${gravFalhas.length} gravação(ões) sem webhook entregue nos últimos ${LIMITES.webhookFalhaDias} dias`);
  if (pendentesPresos.length) problemas.push(`${pendentesPresos.length} webhook(s) de gravação parados em PENDING (reenviar)`);
  const falhasRecentes = memoria.recentFailures.filter((f) => agora - new Date(f.at) < 24 * HORA && f.event !== 'recording.ready');
  if (falhasRecentes.length) problemas.push(`${falhasRecentes.length} webhook(s) de transcrição/exclusão não entregues nas últimas 24 h`);

  const resumoGravacao = (g) => ({
    id: g.id, clientId: g.clientId, roomName: g.roomName, webhookStatus: g.webhookStatus,
    webhookAttempts: g.webhookAttempts, createdAt: new Date(g.createdAt).toISOString(),
  });

  return {
    status: problemas.length ? 'degraded' : 'ok',
    checkedAt: agora.toISOString(),
    version,
    uptimeSec: Math.round(process.uptime()),
    problems: problemas,
    database,
    storage: { type: storage.tipo },
    transcription: {
      configured: configurada,
      minutesConfigured: ataConfigurada,
      byStatus,
      oldestPendingMinutes: pendenteMin,
      process: fila ? fila.estado() : null,
      recentFailures: falhasTr.map((t) => ({
        id: t.id, recordingId: t.recordingId, clientId: t.clientId, error: t.error, attempts: t.attempts,
        updatedAt: new Date(t.updatedAt).toISOString(),
      })),
    },
    webhooks: {
      // Contadores desde o último início do processo
      process: { since: memoria.since, inFlight: memoria.inFlight, attempts: memoria.attempts, delivered: memoria.delivered, retried: memoria.retried, failed: memoria.failed },
      recentFailures: memoria.recentFailures,
      recordingsFailed: gravFalhas.map(resumoGravacao),
      recordingsStuckPending: pendentesPresos.map(resumoGravacao),
    },
  };
}

module.exports = { verificarSaude, LIMITES_SAUDE: LIMITES };
