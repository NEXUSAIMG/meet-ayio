import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { usuarioAtual } from '@/lib/auth';
import { emitirToken } from '@/lib/meetAyio';
import { codigoValido, salaDoCodigo } from '@/lib/util.mjs';

// Token para entrar na sala. Dono da reunião = moderador; o resto = participante.
// Convidado sem conta informa só o nome.
export async function POST(req) {
  const corpo = await req.json().catch(() => ({}));
  const codigo = String(corpo.codigo || '');
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'codigo_invalido' }, { status: 400 });
  const reuniao = await db.meeting.findUnique({ where: { code: codigo } });
  if (!reuniao || reuniao.cancelledAt) return NextResponse.json({ error: 'reuniao_indisponivel' }, { status: 404 });

  const u = await usuarioAtual();
  const nome = (u?.name || String(corpo.nome || '')).trim().replace(/\s+/g, ' ').slice(0, 60);
  if (nome.length < 2) return NextResponse.json({ error: 'nome_obrigatorio' }, { status: 400 });
  const moderador = Boolean(u && u.id === reuniao.ownerId);

  try {
    const t = await emitirToken({ sala: salaDoCodigo(codigo), nome, email: u?.email, id: u?.id, moderador });
    return NextResponse.json({
      token: t.token, dominio: t.domain, sala: t.roomName, nome, moderador,
      salaEspera: reuniao.waitingRoom, gravacao: t.recording?.allowed ?? false,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('[sala/token]', e.message);
    return NextResponse.json({ error: 'servico_indisponivel' }, { status: 502 });
  }
}
