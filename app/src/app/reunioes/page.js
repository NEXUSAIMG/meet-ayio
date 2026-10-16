import Link from 'next/link';
import { Topo } from '@/componentes/Topo';
import { Copiar } from '@/componentes/Copiar';
import { exigirUsuario } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatarDataHora } from '@/lib/util.mjs';
import { acaoNovaReuniao, acaoEntrarComCodigo } from './acoes';

export const metadata = { title: 'Reuniões' };
export const dynamic = 'force-dynamic';

const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

function Linha({ r }) {
  const url = `${APP_URL()}/r/${r.code}`;
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={`/reunioes/${r.id}`} className="block truncate font-semibold hover:text-mar-600">{r.title}</Link>
        <p className="mt-0.5 text-sm text-tinta/60">
          {r.startsAt ? formatarDataHora(r.startsAt) : `Criada em ${formatarDataHora(r.createdAt)}`}
          {r.cancelledAt && <span className="selo ml-2 bg-red-50 text-red-700">cancelada</span>}
          {r._count.invites > 0 && <span className="ml-2">· {r._count.invites} convidado{r._count.invites > 1 ? 's' : ''}</span>}
        </p>
      </div>
      {!r.cancelledAt && (
        <div className="flex shrink-0 gap-2">
          <Copiar texto={url} className="btn-secundario px-3 py-2 text-sm" />
          <Link href={`/r/${r.code}`} className="btn-primario px-3 py-2 text-sm">Entrar</Link>
        </div>
      )}
    </li>
  );
}

export default async function Reunioes(props) {
  const searchParams = await props.searchParams;
  const u = await exigirUsuario('/reunioes');
  const desde = new Date(Date.now() - 2 * 3600_000);
  const [proximas, recentes] = await Promise.all([
    db.meeting.findMany({
      where: { ownerId: u.id, startsAt: { gte: desde }, cancelledAt: null },
      orderBy: { startsAt: 'asc' }, take: 50, include: { _count: { select: { invites: true } } },
    }),
    db.meeting.findMany({
      where: { ownerId: u.id, OR: [{ startsAt: null }, { startsAt: { lt: desde } }, { cancelledAt: { not: null } }] },
      orderBy: { createdAt: 'desc' }, take: 20, include: { _count: { select: { invites: true } } },
    }),
  ]);

  return (
    <>
      <Topo usuario={u} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="font-titulo text-3xl font-bold sm:text-4xl">{u.name ? `Olá, ${u.name.split(' ')[0]}!` : 'Olá!'}</h1>
        <p className="mt-1 text-tinta/65">Comece uma reunião agora ou deixe uma marcada na agenda.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[auto_auto_1fr]">
          <form action={acaoNovaReuniao}><button className="btn-primario w-full sm:w-auto">+ Nova reunião agora</button></form>
          <Link href="/reunioes/agendar" className="btn-secundario">Agendar reunião</Link>
          <form action={acaoEntrarComCodigo} className="flex gap-2 sm:justify-self-end">
            <input name="codigo" className="campo sm:w-56" placeholder="Código ou link" aria-label="Código ou link da reunião" />
            <button className="btn-secundario">Entrar</button>
          </form>
        </div>
        {searchParams?.erro === 'codigo' && <p className="mt-2 text-sm text-red-700">Código inválido. Ele tem o formato abc-defg-hij.</p>}

        <section className="cartao mt-8">
          <h2 className="font-titulo text-xl font-bold">Próximas</h2>
          {proximas.length ? <ul className="divide-y divide-tinta/10">{proximas.map((r) => <Linha key={r.id} r={r} />)}</ul>
            : <p className="py-4 text-tinta/60">Nenhuma reunião agendada. <Link href="/reunioes/agendar" className="font-semibold text-mar-600 underline">Agendar uma</Link></p>}
        </section>

        <section className="cartao mt-6">
          <h2 className="font-titulo text-xl font-bold">Recentes</h2>
          {recentes.length ? <ul className="divide-y divide-tinta/10">{recentes.map((r) => <Linha key={r.id} r={r} />)}</ul>
            : <p className="py-4 text-tinta/60">As reuniões que você fizer aparecem aqui, com gravações e atas.</p>}
        </section>
      </main>
    </>
  );
}
