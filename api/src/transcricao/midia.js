const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const MIN_PARTE_SEG = 1.5;

const executar = (bin, args) => new Promise((resolve, reject) => {
  execFile(bin, args, { maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
    if (err) return reject(Object.assign(new Error(`${path.basename(bin)} falhou: ${(stderr || err.message).trim().slice(0, 300)}`), { stderr }));
    resolve(stdout);
  });
});

// Funções de áudio com ffmpeg/ffprobe (precisam estar no PATH ou em FFMPEG_PATH/FFPROBE_PATH).
function criarMidia({ ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' } = {}) {
  async function duracao(arquivo) {
    const out = await executar(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arquivo]);
    const d = parseFloat(out);
    return Number.isFinite(d) ? d : 0;
  }

  async function temAudio(arquivo) {
    const out = await executar(ffprobe, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', arquivo]);
    return out.trim().length > 0;
  }

  // Extrai a faixa de áudio em mono 16 kHz MP3 32 kbps (~14 MB/hora, ótimo para
  // Whisper) e corta em partes de `segundos`. Devolve [{ arquivo, inicio, duracao }]
  // com o início de cada parte no tempo da gravação. Sem faixa de áudio → [].
  async function extrairAudioEmPartes(entrada, dirSaida, { segundos = 1200 } = {}) {
    if (!(await temAudio(entrada))) return [];
    await fs.mkdir(dirSaida, { recursive: true });
    await executar(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', entrada,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k',
      '-f', 'segment', '-segment_time', String(segundos), '-reset_timestamps', '1',
      path.join(dirSaida, 'parte-%03d.mp3'),
    ]);
    const nomes = (await fs.readdir(dirSaida)).filter((n) => /^parte-\d{3}\.mp3$/.test(n)).sort();
    const partes = [];
    let inicio = 0;
    for (const nome of nomes) {
      const arquivo = path.join(dirSaida, nome);
      const d = await duracao(arquivo);
      // O segment muxer às vezes gera uma sobra de ~0 s no fim (duração múltipla do
      // corte). Áudio quase vazio faz o Whisper "alucinar" frases → descarta.
      if (d >= MIN_PARTE_SEG) partes.push({ arquivo, inicio, duracao: d });
      inicio += d;
    }
    return partes;
  }

  return { duracao, temAudio, extrairAudioEmPartes };
}

module.exports = { criarMidia };
