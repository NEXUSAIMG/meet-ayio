import { escaparHtml as e, formatarDataLonga } from './util.mjs';

const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

// Envio pelo Resend (API HTTP). Sem RESEND_API_KEY, registra no log do servidor
// (útil em teste: o link de login aparece nos logs do Railway).
export async function enviarEmail({ para, assunto, html, texto, anexos = [] }) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    console.log(`[email:sem-resend] para=${para} assunto="${assunto}"\n${texto}`);
    return { ok: true, simulado: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Meet Ayio <onboarding@resend.dev>',
      to: Array.isArray(para) ? para : [para],
      subject: assunto, html, text: texto,
      attachments: anexos.map((a) => ({ filename: a.nome, content: Buffer.from(a.conteudo).toString('base64'), content_type: a.tipo })),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => '');
    console.error(`[email] Resend ${r.status}: ${corpo.slice(0, 300)}`);
    return { ok: false, status: r.status };
  }
  return { ok: true };
}

// Moldura simples, legível em qualquer cliente de e-mail.
function moldura(conteudo) {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ee;font-family:Arial,Helvetica,sans-serif;color:#14213d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
  <tr><td style="font-size:18px;font-weight:bold;color:#115557;padding-bottom:20px">Meet Ayio</td></tr>
  <tr><td style="font-size:15px;line-height:1.55">${conteudo}</td></tr></table>
  <p style="font-size:12px;color:#6b7280;margin-top:16px">Você recebeu este e-mail por causa do Meet Ayio. Se não esperava por ele, pode ignorar.</p>
  </td></tr></table></body></html>`;
}
const botao = (url, texto) =>
  `<p style="margin:24px 0"><a href="${e(url)}" style="background:#176f70;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${e(texto)}</a></p>`;

export function emailLogin(url) {
  return {
    assunto: 'Seu link para entrar no Meet Ayio',
    html: moldura(`<p>Clique no botão para entrar. O link vale por 1 hora e só funciona uma vez.</p>${botao(url, 'Entrar no Meet Ayio')}
      <p style="font-size:13px;color:#6b7280">Se o botão não abrir, copie este endereço no navegador:<br>${e(url)}</p>`),
    texto: `Entre no Meet Ayio (link válido por 1 hora, uma vez):\n${url}`,
  };
}

export function emailConvite({ reuniao, anfitriao, cancelado = false }) {
  const url = `${APP_URL()}/r/${reuniao.code}`;
  const quando = formatarDataLonga(reuniao.startsAt);
  const nome = anfitriao.name || anfitriao.email;
  if (cancelado) {
    return {
      assunto: `Cancelada: ${reuniao.title}`,
      html: moldura(`<p><strong>${e(nome)}</strong> cancelou a reunião <strong>${e(reuniao.title)}</strong> de ${e(quando)} (horário de Brasília).</p>`),
      texto: `${nome} cancelou a reunião "${reuniao.title}" de ${quando} (horário de Brasília).`,
    };
  }
  return {
    assunto: `Convite: ${reuniao.title} — ${quando}`,
    html: moldura(`<p><strong>${e(nome)}</strong> convidou você para uma reunião por vídeo.</p>
      <p style="margin:16px 0;padding:14px 16px;background:#eef6f6;border-radius:8px"><strong>${e(reuniao.title)}</strong><br>${e(quando)} (horário de Brasília)<br>Duração: ${reuniao.durationMin || 60} min</p>
      ${botao(url, 'Entrar na reunião')}
      <p style="font-size:13px;color:#6b7280">Não precisa instalar nada nem criar conta: abra o link no navegador do computador ou do celular na hora da reunião.<br>${e(url)}</p>`),
    texto: `${nome} convidou você para "${reuniao.title}", ${quando} (horário de Brasília).\nEntrar: ${url}`,
  };
}
