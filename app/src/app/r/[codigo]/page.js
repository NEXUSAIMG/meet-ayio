import Link from 'next/link';
import { Marca } from '@/componentes/Marca';
import { db } from '@/lib/db';
import { usuarioAtual } from '@/lib/auth';
import { codigoValido, formatarDataLonga } from '@/lib/util.mjs';
import { Sala } from './Sala';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reunião', robots: { index: false } };

function Aviso({ titulo, texto }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Marca />
      <div className="cartao mt-8 max-w-md">
        <h1 className="font-titulo text-2xl font-bold">{titulo}</h1>
        <p className="mt-2 text-tinta/65">{texto}</p>
        <Link href="/" className="btn-secundario mt-6">Ir para o início</Link>
      </div>
    </main>
  );
}

export default async function PaginaSala(props) {
  const params = await props.params;
  const codigo = String(params.codigo || '').toLowerCase();
  if (!codigoValido(codigo)) return <Aviso titulo="Link inválido" texto="Confira o endereço. O código da reunião tem o formato abc-defg-hij." />;
  const r = await db.meeting.findUnique({ where: { code: codigo }, include: { owner: { select: { name: true, email: true } } } });
  if (!r) return <Aviso titulo="Reunião não encontrada" texto="Esse link não corresponde a nenhuma reunião. Peça o link de novo a quem convidou você." />;
  if (r.cancelledAt) return <Aviso titulo="Reunião cancelada" texto={`${r.owner.name || 'O anfitrião'} cancelou esta reunião.`} />;
  const u = await usuarioAtual();
  return (
    <Sala
      codigo={codigo}
      titulo={r.title}
      quando={r.startsAt ? formatarDataLonga(r.startsAt) : null}
      anfitriao={r.owner.name || r.owner.email.split('@')[0]}
      usuario={u ? { nome: u.name || '', dono: u.id === r.ownerId } : null}
      voltar={u ? `/reunioes${u.id === r.ownerId ? `/${r.id}` : ''}` : '/'}
    />
  );
}
