import { NextResponse } from 'next/server';
import { usuarioAtual } from '@/lib/auth';
import { reuniaoDoDono } from '@/lib/reunioes';
import { detalheGravacao } from '@/lib/meetAyio';
import { salaDoCodigo } from '@/lib/util.mjs';

// Link de download curto (15 min), gerado na hora e só para o dono da reunião.
export async function GET(req, { params }) {
  const { id } = await params;
  const u = await usuarioAtual();
  if (!u) return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });
  const reuniao = await reuniaoDoDono(new URL(req.url).searchParams.get('reuniao') || '', u.id);
  if (!reuniao) return NextResponse.json({ error: 'nao_encontrada' }, { status: 404 });
  const g = await detalheGravacao(id).catch(() => null);
  if (!g || g.roomName !== salaDoCodigo(reuniao.code)) return NextResponse.json({ error: 'nao_encontrada' }, { status: 404 });
  return NextResponse.redirect(g.downloadUrl, 302);
}
