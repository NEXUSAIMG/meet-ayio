// Rascunho de ata a partir da transcrição, via Anthropic Messages API.

// Regras que valem sempre, mesmo com instruções próprias do cliente.
const REGRAS = `Você redige atas de reuniões feitas por videoconferência, em português do Brasil,
a partir da TRANSCRIÇÃO AUTOMÁTICA da fala (Whisper). O resultado é um RASCUNHO que
uma pessoa vai revisar antes de qualquer uso.

Regras invioláveis:
- Fidelidade total: não invente, não complete e não deduza fatos, nomes, datas,
  valores, números de documentos ou decisões que não estejam explícitos na transcrição.
- A transcrição NÃO identifica quem fala. Não atribua falas a pessoas, a menos que a
  própria fala deixe claro quem é (ex.: "aqui é a Karina, do cartório"). Na dúvida,
  use formas impessoais ("foi informado que", "um dos participantes perguntou").
- Trechos sem sentido ou truncados: marque [inaudível] ou [trecho incerto]. Nunca
  preencha por conta própria.
- Não acrescente fundamentação jurídica, opinião ou recomendação.
- Primeira linha exatamente: "RASCUNHO DE ATA (gerado por IA — revisar)".
- Responda só com a ata, sem comentários antes ou depois.`;

const FORMATO_PADRAO = `Formato:
1. IDENTIFICAÇÃO — sala, data, horário de início (se informado), duração e
   participantes (só os do contexto; se vierem como "pessoas que receberam
   acesso", liste assim, sem afirmar que todas participaram; se nenhum,
   "não informados").
2. RESUMO — 3 a 6 linhas com o objetivo e o resultado da reunião.
3. ASSUNTOS TRATADOS — tópicos em ordem cronológica, com o tempo aproximado
   [mm:ss] de cada um.
4. DECISÕES E ENCAMINHAMENTOS — o que foi decidido, quem fica responsável e prazo,
   quando ditos. Se nada foi decidido, "Nenhuma decisão registrada".
5. PENDÊNCIAS E DÚVIDAS — perguntas que ficaram sem resposta.`;

const mmss = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
};

// Transcrição com marcas de tempo, para a IA situar os assuntos.
function transcricaoComTempos(texto, segmentos) {
  if (!segmentos?.length) return texto || '';
  return segmentos.map((s) => `[${mmss(s.start)}] ${s.text}`).join('\n');
}

function criarRedator({ apiKey, modelo, apiUrl = 'https://api.anthropic.com/v1/messages', timeoutMs = 180_000, maxTokens = 4000 }) {
  return {
    configurado: Boolean(apiKey && modelo),
    modelo,
    // contexto: { sala, titulo, data (ISO), duracaoSeg, participantes[] }
    async redigir({ texto, segmentos, contexto = {}, instrucoesCliente, instrucoesExtras }) {
      const system = `${REGRAS}\n\n${instrucoesCliente?.trim() || FORMATO_PADRAO}`;
      const linhasContexto = [
        `Sala: ${contexto.sala || 'não informada'}`,
        contexto.titulo ? `Título: ${contexto.titulo}` : null,
        contexto.data ? `Data/hora da gravação (UTC): ${contexto.data}` : null,
        contexto.duracaoSeg ? `Duração: ${mmss(contexto.duracaoSeg)}` : null,
        contexto.participantes?.length
          ? `Participantes informados: ${contexto.participantes.join('; ')}`
          : contexto.acessos?.length
            ? `Pessoas que receberam acesso à sala (pelo sistema; alguém pode não ter entrado): ${contexto.acessos.join('; ')}`
            : 'Participantes informados: não informados',
      ].filter(Boolean).join('\n');
      const user = `CONTEXTO:\n${linhasContexto}\n\n`
        + (instrucoesExtras ? `INSTRUÇÕES ADICIONAIS PARA ESTA ATA:\n${instrucoesExtras}\n\n` : '')
        + `TRANSCRIÇÃO (automática, sem identificação de quem fala):\n"""\n${transcricaoComTempos(texto, segmentos)}\n"""\n\n`
        + 'Redija o rascunho da ata seguindo as regras.';

      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) {
        let msg = '';
        try { msg = (await r.json())?.error?.message || ''; } catch { /* corpo não-JSON */ }
        throw new Error(`IA HTTP ${r.status}${msg ? `: ${msg}` : ''}`);
      }
      const j = await r.json();
      const ata = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (!ata) throw new Error('IA devolveu resposta vazia');
      return { ata, modelo: j.model || modelo };
    },
  };
}

module.exports = { criarRedator, transcricaoComTempos, REGRAS, FORMATO_PADRAO };
