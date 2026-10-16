// Exclusão automática das gravações vencidas (retenção por cliente, LGPD).
async function executarRetencao({ store, storage, agora = new Date(), lote = 100 }) {
  let apagadas = 0;
  for (;;) {
    const vencidas = await store.listExpiredRecordings(agora, lote);
    if (!vencidas.length) break;
    for (const g of vencidas) {
      await storage.delete(g.storageKey);
      await store.updateRecording(g.id, { status: 'DELETED', deletedAt: new Date() });
      apagadas++;
    }
    if (vencidas.length < lote) break;
  }
  return apagadas;
}

module.exports = { executarRetencao };
