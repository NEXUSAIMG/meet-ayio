import { NextResponse } from 'next/server';
import { consumirLink, gravarCookieSessao } from '@/lib/auth';

const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

export async function POST(req) {
  const form = await req.formData();
  const r = await consumirLink(String(form.get('t') || ''));
  if (!r) return NextResponse.redirect(`${APP_URL()}/entrar?erro=link`, 303);
  const resposta = NextResponse.redirect(`${APP_URL()}${r.destino}`, 303);
  gravarCookieSessao(resposta, r.sessao);
  return resposta;
}
