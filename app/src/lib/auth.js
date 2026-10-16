import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
import { enviarEmail, emailLogin } from './email';
import { sha256, tokenAleatorio, normalizarEmail, emailValido, caminhoSeguro } from './util.mjs';

export const COOKIE = 'ma_sessao';
const VALIDADE_LINK_MS = 15 * 60_000;
const VALIDADE_SESSAO_MS = 30 * 24 * 3600_000;
const LINKS_POR_HORA = 5;
const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

// Pede o link mágico. Não revela se o e-mail já tem conta (resposta sempre igual).
export async function pedirLinkLogin(emailBruto, proximo) {
  const email = normalizarEmail(emailBruto);
  if (!emailValido(email)) return { erro: 'Digite um e-mail válido.' };
  const recentes = await db.loginToken.count({ where: { email, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recentes >= LINKS_POR_HORA) return { erro: 'Muitos pedidos para este e-mail. Tente de novo em uma hora.' };
  const token = tokenAleatorio();
  await db.loginToken.create({
    data: { tokenHash: sha256(token), email, next: caminhoSeguro(proximo), expiresAt: new Date(Date.now() + VALIDADE_LINK_MS) },
  });
  const url = `${APP_URL()}/entrar/verificar?t=${encodeURIComponent(token)}`;
  const m = emailLogin(url);
  const r = await enviarEmail({ para: email, assunto: m.assunto, html: m.html, texto: m.texto });
  if (!r.ok) return { erro: 'Não conseguimos enviar o e-mail agora. Tente de novo em instantes.' };
  return { ok: true, email };
}

// Consome o link: cria a conta no primeiro acesso e abre a sessão. Devolve o destino.
export async function consumirLink(token) {
  if (!token || token.length > 100) return null;
  const registro = await db.loginToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!registro || registro.usedAt || registro.expiresAt < new Date()) return null;
  // marca como usado de forma atômica (dois cliques no mesmo link não abrem duas sessões)
  const usado = await db.loginToken.updateMany({ where: { id: registro.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!usado.count) return null;
  const usuario = await db.user.upsert({ where: { email: registro.email }, create: { email: registro.email }, update: {} });
  const sessao = tokenAleatorio();
  await db.session.create({ data: { tokenHash: sha256(sessao), userId: usuario.id, expiresAt: new Date(Date.now() + VALIDADE_SESSAO_MS) } });
  return { sessao, destino: usuario.name ? caminhoSeguro(registro.next) : `/bem-vindo?next=${encodeURIComponent(caminhoSeguro(registro.next))}` };
}

export function gravarCookieSessao(resposta, sessao) {
  resposta.cookies.set(COOKIE, sessao, {
    httpOnly: true, sameSite: 'lax', secure: APP_URL().startsWith('https://'), path: '/', maxAge: VALIDADE_SESSAO_MS / 1000,
  });
}

export async function usuarioAtual() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sessao = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!sessao || sessao.expiresAt < new Date()) return null;
  return sessao.user;
}

export async function exigirUsuario(voltarPara = '/reunioes') {
  const u = await usuarioAtual();
  if (!u) redirect(`/entrar?next=${encodeURIComponent(voltarPara)}`);
  return u;
}

export async function encerrarSessao() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}
