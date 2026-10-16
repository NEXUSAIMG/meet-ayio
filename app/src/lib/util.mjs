// Funções puras (testadas em test/util.test.mjs).
import crypto from 'node:crypto';

// Código da reunião no estilo abc-defg-hij (sem letras que confundem: l, o, i).
const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
export function gerarCodigo(aleatorio = crypto.randomInt) {
  const parte = (n) => Array.from({ length: n }, () => LETRAS[aleatorio(LETRAS.length)]).join('');
  return `${parte(3)}-${parte(4)}-${parte(3)}`;
}
export const codigoValido = (c) => /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(String(c || ''));
export const salaDoCodigo = (codigo) => `m-${codigo}`;

export const tokenAleatorio = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export const emailValido = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e || '').trim());
export const normalizarEmail = (e) => String(e || '').trim().toLowerCase();

// Só aceita voltar para caminhos internos (evita redirecionar para outro site).
export const caminhoSeguro = (p, padrao = '/reunioes') =>
  typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && p.length <= 300 ? p : padrao;

// Lista de e-mails digitada (vírgula, ponto e vírgula, espaço ou linha).
export function lerEmails(texto, max = 50) {
  const vistos = new Set();
  const validos = [];
  const invalidos = [];
  for (const bruto of String(texto || '').split(/[\s,;]+/)) {
    if (!bruto) continue;
    const e = normalizarEmail(bruto);
    if (vistos.has(e)) continue;
    vistos.add(e);
    (emailValido(e) ? validos : invalidos).push(e);
  }
  return { validos: validos.slice(0, max), invalidos, excedeu: validos.length > max };
}

// Convite de calendário (.ics), compatível com Google Agenda, Outlook e Apple.
const dataIcs = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escaparIcs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
function dobrar(linha) {
  // Linhas de no máximo 75 octetos (RFC 5545), continuação com espaço.
  const partes = [];
  let atual = '';
  for (const ch of linha) {
    if (Buffer.byteLength(atual + ch) > 73) { partes.push(atual); atual = ' '; }
    atual += ch;
  }
  partes.push(atual);
  return partes.join('\r\n');
}
export function gerarIcs({ uid, inicio, duracaoMin = 60, titulo, descricao, url, organizador, convidados = [], cancelado = false, sequencia = 0, agora = new Date() }) {
  const fim = new Date(new Date(inicio).getTime() + duracaoMin * 60_000);
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meet Ayio//Reunioes//PT', 'CALSCALE:GREGORIAN',
    `METHOD:${cancelado ? 'CANCEL' : 'REQUEST'}`, 'BEGIN:VEVENT',
    `UID:${uid}`, `SEQUENCE:${sequencia}`, `DTSTAMP:${dataIcs(agora)}`, `DTSTART:${dataIcs(inicio)}`, `DTEND:${dataIcs(fim)}`,
    `SUMMARY:${escaparIcs(titulo)}`, `DESCRIPTION:${escaparIcs(descricao)}`, `LOCATION:${escaparIcs(url)}`, `URL:${url}`,
    `ORGANIZER;CN=${escaparIcs(organizador.nome || organizador.email)}:mailto:${organizador.email}`,
    ...convidados.map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`),
    `STATUS:${cancelado ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

// "16/10/2026, 15:00" no fuso de Brasília (padrão do app).
export const FUSO = 'America/Sao_Paulo';
export const formatarDataHora = (d, fuso = FUSO) => new Date(d).toLocaleString('pt-BR', {
  timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export const formatarDataLonga = (d, fuso = FUSO) => new Date(d).toLocaleString('pt-BR', {
  timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

// "2026-10-20T15:00" digitado no fuso informado (offset em minutos como o do navegador: getTimezoneOffset) → Date UTC.
export function lerDataLocal(texto, offsetMin) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(texto || ''));
  if (!m || !Number.isFinite(offsetMin)) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + offsetMin * 60_000;
  const d = new Date(utc);
  return isNaN(d) ? null : d;
}

export const escaparHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
