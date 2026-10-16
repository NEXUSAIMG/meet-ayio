// Quotas por cliente. Todas opcionais: null = sem limite (padrão).
// - quotaRecordedMinutes: minutos gravados no mês (UTC)
// - quotaTranscribedMinutes: minutos transcritos no mês (UTC)
// - quotaStorageMb: espaço ocupado agora pelas gravações guardadas
// São limites "macios": o que já está em andamento termina (uma gravação longa
// pode passar do limite). Ao atingir, o moderador deixa de receber o botão de
// gravar e novas transcrições são recusadas até o mês virar (ou a quota subir).

const CAMPOS = {
  quotaRecordedMinutes: 'recordedMinutes',
  quotaTranscribedMinutes: 'transcribedMinutes',
  quotaStorageMb: 'storageMb',
};

function periodoDoMes(agora = new Date()) {
  const de = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const ate = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  return { de, ate, mes: de.toISOString().slice(0, 7) };
}

const limitesDo = (cliente) => Object.fromEntries(
  Object.entries(CAMPOS).map(([campo, nome]) => [nome, cliente[campo] ?? null]));

const temLimite = (cliente) => Object.keys(CAMPOS).some((c) => cliente[c] != null);

// Valida o corpo do admin: aceita null (sem limite) ou inteiro >= 0. Devolve { dados } ou { erro }.
function lerQuotas(body = {}) {
  const dados = {};
  for (const campo of Object.keys(CAMPOS)) {
    if (body[campo] === undefined) continue;
    const v = body[campo];
    if (v === null || v === '') { dados[campo] = null; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) return { erro: campo };
    dados[campo] = n;
  }
  return { dados };
}

// Situação do cliente no mês. Sem nenhum limite, não consulta o banco (caminho
// comum: emissão de token não fica mais lenta).
async function situacaoQuotas(store, cliente, { agora = new Date(), uso: usoPronto } = {}) {
  const { de, ate, mes } = periodoDoMes(agora);
  const limits = limitesDo(cliente);
  if (!temLimite(cliente) && !usoPronto) {
    return { month: mes, limits, used: null, exceeded: [], recordingAllowed: true, transcriptionAllowed: true };
  }
  const uso = usoPronto || await store.usage(cliente.id, de, ate);
  const bytes = await store.storageBytes(cliente.id);
  const used = {
    recordedMinutes: uso.recordedMinutes,
    transcribedMinutes: uso.transcribedMinutes,
    storageMb: Math.ceil(bytes / 1_048_576),
  };
  const exceeded = Object.keys(used).filter((k) => limits[k] != null && used[k] >= limits[k]);
  return {
    month: mes, limits, used, exceeded,
    recordingAllowed: !exceeded.includes('recordedMinutes') && !exceeded.includes('storageMb'),
    transcriptionAllowed: !exceeded.includes('transcribedMinutes'),
  };
}

module.exports = { situacaoQuotas, lerQuotas, periodoDoMes, temLimite, CAMPOS_QUOTA: Object.keys(CAMPOS) };
