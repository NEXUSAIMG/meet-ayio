const crypto = require('crypto');

// Assinatura no estilo Stripe: header "t=<unix>,v1=<hmac_sha256(segredo, `${t}.${corpo}`)>".
function assinar(segredo, corpo, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

// Para o cliente validar (exportado também no guia de integração).
function verificarAssinatura(segredo, corpo, header, toleranciaSeg = 300) {
  const partes = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  const t = Number(partes.t);
  if (!t || !partes.v1 || Math.abs(Date.now() / 1000 - t) > toleranciaSeg) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex');
  return partes.v1.length === esperado.length && crypto.timingSafeEqual(Buffer.from(partes.v1), Buffer.from(esperado));
}

async function enviar({ url, segredo, evento, dados, timeoutMs }) {
  const corpo = JSON.stringify({ id: crypto.randomUUID(), event: evento, createdAt: new Date().toISOString(), data: dados });
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'MeetAyio-Webhook/1',
        'x-meetayio-event': evento,
        'x-meetayio-signature': assinar(segredo || '', corpo),
      },
      body: corpo,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, erro: e.message };
  }
}

// Entregas com retentativas em processo.
function criarNotificador({ store, delaysMs, timeoutMs, agendar = setTimeout, maxFalhasGuardadas = 50 }) {
  const pendentes = new Set();
  // Monitoramento (em memória: zera ao reiniciar; o estado de recording.ready
  // também fica no banco, em recordings.webhook_status).
  const contadores = { attempts: 0, delivered: 0, retried: 0, failed: 0 };
  const falhas = []; // últimas entregas que desistiram, mais recente primeiro
  const desde = new Date();

  // aoTentar(resultado, { tentativa, ultima }) → false interrompe as próximas tentativas.
  function entregar({ cliente, evento, dados, aoTentar = async () => {} }) {
    if (!cliente.webhookUrl) return false;
    const tentar = async (i) => {
      const r = await enviar({ url: cliente.webhookUrl, segredo: cliente.webhookSecret, evento, dados, timeoutMs });
      contadores.attempts++;
      const ultima = i + 1 >= delaysMs.length;
      const continuar = await aoTentar(r, { tentativa: i + 1, ultima });
      if (r.ok) contadores.delivered++;
      if (!r.ok && !ultima && continuar !== false) { contadores.retried++; programar(i + 1); }
      if (!r.ok && ultima) {
        contadores.failed++;
        falhas.unshift({
          event: evento, client: cliente.slug, attempts: i + 1, status: r.status, error: r.erro || null,
          recordingId: dados?.id || dados?.recordingId || null, at: new Date().toISOString(),
        });
        falhas.length = Math.min(falhas.length, maxFalhasGuardadas);
        console.warn(`[webhook] ${evento} não entregue a ${cliente.slug} após ${i + 1} tentativas`);
      }
    };
    const programar = (i) => {
      const p = new Promise((resolve) => {
        agendar(() => tentar(i).catch((e) => console.error('[webhook]', e)).finally(resolve), delaysMs[i] || 0);
      });
      pendentes.add(p);
      p.finally(() => pendentes.delete(p));
    };
    programar(0);
    return true;
  }

  // recording.ready, com o estado da entrega salvo na gravação.
  async function notificarGravacao(gravacao, cliente, publico) {
    if (!cliente.webhookUrl) return store.updateRecording(gravacao.id, { webhookStatus: 'NONE' });
    await store.updateRecording(gravacao.id, { webhookStatus: 'PENDING' });
    entregar({
      cliente, evento: 'recording.ready', dados: publico,
      aoTentar: async (r, { ultima }) => {
        const atual = await store.getRecording(gravacao.id);
        if (!atual || atual.status === 'DELETED') return false;
        await store.updateRecording(gravacao.id, {
          webhookAttempts: (atual.webhookAttempts || 0) + 1,
          webhookStatus: r.ok ? 'DELIVERED' : ultima ? 'FAILED' : 'PENDING',
        });
        return true;
      },
    });
  }

  // Testes: espera até não haver entregas em andamento.
  async function aguardar() {
    while (pendentes.size) await Promise.all([...pendentes]);
  }

  const estatisticas = () => ({
    since: desde.toISOString(), inFlight: pendentes.size, ...contadores, recentFailures: falhas.map((f) => ({ ...f })),
  });

  return { entregar, notificarGravacao, aguardar, estatisticas, enviar: (opts) => enviar({ timeoutMs, ...opts }) };
}

module.exports = { assinar, verificarAssinatura, criarNotificador };
