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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
      signal: ctrl.signal,
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, erro: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Entrega recording.ready com retentativas em processo (estado salvo na gravação).
function criarNotificador({ store, delaysMs, timeoutMs, agendar = setTimeout }) {
  const pendentes = new Set();

  function notificarGravacao(gravacao, cliente, publico) {
    if (!cliente.webhookUrl) return store.updateRecording(gravacao.id, { webhookStatus: 'NONE' });
    const tentar = async (i) => {
      const r = await enviar({ url: cliente.webhookUrl, segredo: cliente.webhookSecret, evento: 'recording.ready', dados: publico, timeoutMs });
      const atual = await store.getRecording(gravacao.id);
      if (!atual || atual.status === 'DELETED') return;
      const ultima = i + 1 >= delaysMs.length;
      await store.updateRecording(gravacao.id, {
        webhookAttempts: (atual.webhookAttempts || 0) + 1,
        webhookStatus: r.ok ? 'DELIVERED' : ultima ? 'FAILED' : 'PENDING',
      });
      if (!r.ok && !ultima) programar(i + 1);
    };
    const programar = (i) => {
      const p = new Promise((resolve) => {
        agendar(() => tentar(i).catch((e) => console.error('[webhook]', e)).finally(resolve), delaysMs[i] || 0);
      });
      pendentes.add(p);
      p.finally(() => pendentes.delete(p));
    };
    return store.updateRecording(gravacao.id, { webhookStatus: 'PENDING' }).then(() => programar(0));
  }

  // Testes: espera até não haver entregas em andamento.
  async function aguardar() {
    while (pendentes.size) await Promise.all([...pendentes]);
  }

  return { notificarGravacao, aguardar, enviar: (opts) => enviar({ timeoutMs, ...opts }) };
}

module.exports = { assinar, verificarAssinatura, criarNotificador };
