const fs = require('fs');
const path = require('path');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Transcrição por API compatível com a da OpenAI (/audio/transcriptions).
// Padrão: Groq whisper-large-v3-turbo (o mesmo que o SeuCartório já usa).
function criarTranscritor({ url, apiKey, modelo, idioma = 'pt', timeoutMs = 120_000, tentativas = 3, pausaMs = 2000 }) {
  async function uma(arquivo) {
    const form = new FormData();
    form.append('file', await fs.openAsBlob(arquivo, { type: 'audio/mpeg' }), path.basename(arquivo));
    form.append('model', modelo);
    form.append('language', idioma);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json())?.error?.message || ''; } catch { /* corpo não-JSON */ }
      throw Object.assign(new Error(`transcrição HTTP ${r.status}${msg ? `: ${msg}` : ''}`), { status: r.status });
    }
    const j = await r.json();
    return {
      texto: String(j.text || '').trim(),
      segmentos: (j.segments || []).map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
        .filter((s) => s.text),
    };
  }

  return {
    configurado: Boolean(url && apiKey && modelo),
    async transcrever(arquivo) {
      for (let i = 1; ; i++) {
        try {
          return await uma(arquivo);
        } catch (e) {
          const repetivel = !e.status || e.status === 429 || e.status >= 500;
          if (!repetivel || i >= tentativas) throw e;
          await esperar(pausaMs * i);
        }
      }
    },
  };
}

module.exports = { criarTranscritor };
