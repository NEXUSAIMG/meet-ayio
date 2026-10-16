// [{ userName, moderator }] em ordem → ["Karina (moderador)", "Davi"] sem repetir nomes.
function nomesDistintos(linhas) {
  const vistos = new Map();
  for (const { userName, moderator } of linhas) {
    const nome = String(userName || '').trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    const anterior = vistos.get(chave);
    // mantém a grafia da primeira entrada; vira moderador se recebeu token de moderador alguma vez
    vistos.set(chave, { nome: anterior?.nome || nome, moderador: Boolean(moderator) || Boolean(anterior?.moderador) });
  }
  return [...vistos.values()].map((v) => (v.moderador ? `${v.nome} (moderador)` : v.nome));
}

module.exports = { nomesDistintos };
