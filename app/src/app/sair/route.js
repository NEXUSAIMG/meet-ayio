import { NextResponse } from 'next/server';
import { encerrarSessao, COOKIE } from '@/lib/auth';

export async function POST() {
  await encerrarSessao();
  const r = NextResponse.redirect(`${(process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '')}/`, 303);
  r.cookies.delete(COOKIE);
  return r;
}
