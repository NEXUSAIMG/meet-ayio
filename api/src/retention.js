// Apaga arquivo, transcrição/ata e marca a gravação como DELETED (LGPD).
// Avisa o cliente (recording.deleted) para ele apagar as cópias que guardou (ex.: a ata).
async function apagarGravacao({ store, storage, notificador, gravacao, motivo }) {
  await storage.delete(gravacao.storageKey);
  await store.deleteTranscriptByRecording(gravacao.id);
  await store.updateRecording(gravacao.id, { status: 'DELETED', deletedAt: new Date() });
  if (notificador) {
    const cliente = await store.getClientById(gravacao.clientId);
    if (cliente) {
      notificador.entregar({
        cliente, evento: 'recording.deleted',
        dados: { id: gravacao.id, roomName: gravacao.roomName, reason: motivo, deletedAt: new Date().toISOString() },
      });
    }
  }
}

// Exclusão automática das gravações vencidas (retenção por cliente) e dos nomes
// guardados junto dos tokens (usados só para a lista de participantes da ata).
async function executarRetencao({ store, storage, notificador, agora = new Date(), lote = 100, diasNomesTokens = 90 }) {
  await store.clearTokenNamesBefore(new Date(agora.getTime() - diasNomesTokens * 86_400_000));
  let apagadas = 0;
  for (;;) {
    const vencidas = await store.listExpiredRecordings(agora, lote);
    if (!vencidas.length) break;
    for (const gravacao of vencidas) {
      await apagarGravacao({ store, storage, notificador, gravacao, motivo: 'retention' });
      apagadas++;
    }
    if (vencidas.length < lote) break;
  }
  return apagadas;
}

module.exports = { executarRetencao, apagarGravacao };
