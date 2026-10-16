import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topo } from '@/componentes/Topo';
import { Copiar } from '@/componentes/Copiar';
import { exigirUsuario } from '@/lib/auth';
import { reuniaoDoDono } from '@/lib/reunioes';
import { listarGravacoes, transcricao } from '@/lib/meetAyio';
import { formatarDataHora, formatarDataLonga, salaDoCodigo } from '@/lib/util.mjs';
import { acaoCancelar, acaoReenviarConvites, acaoSalaEspera, acaoGerarAta, acaoApagarGravacao } from '../acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reunião' };

const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');
const duracao = (s) => (s == null ? '' : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const tamanho = (b) => `${(Number(b || 0) / 1048576).toFixed(0)} MB`;

async function carregarGravacoes(codigo) {
  try {
    const lista = await listarGravacoes(salaDoCodigo(codigo));
    return { lista: await Promise.all(lista.map(async (g) => ({ ...g, ata: await transcricao(g.id).catch(() => null) }))) };
  } catch (e) {
    console.error('[gravacoes]', e.message);
    return { lista: [], erro: true };
  }
}

function SituacaoAta({ ata }) {
  if (!ata) return null;
  const mapa = { PENDING: ['na fila', 'bg-sol-400/20 text-tinta'], PROCESSING: ['gerando…', 'bg-sol-400/20 text-tinta'], DONE: ['pronta', 'bg-mar-50 text-mar-700'], FAILED: ['falhou', 'bg-red-50 text-red-700'] };
  const [txt, cor] = mapa[ata.status] || [ata.status, 'bg-areia'];
  return <span className={`selo ${cor}`}>ata {txt}</span>;
}

export default async function Reuniao(props) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const u = await exigirUsuario(`/reunioes/${params.id}`);
  const r = await reuniaoDoDono(params.id, u.id);
  if (!r) notFound();
  const url = `${APP_URL()}/r/${r.code}`;
  const { lista, erro } = await carregarGravacoes(r.code);
  const futura = r.startsAt && r.startsAt > new Date();

  return (
    <>
      <Topo usuario={u} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <Link href="/reunioes" className="text-sm text-tinta/60 hover:text-tinta">← Reuniões</Link>

        {searchParams?.agendada && (
          <p className="mt-4 rounded-lg bg-mar-50 px-4 py-3 text-sm text-mar-700" role="status">
            Reunião agendada.{' '}
            {searchParams.email === 'off' ? 'O envio de e-mail ainda não está configurado: copie o link abaixo e mande aos convidados.'
              : searchParams.falhas !== '0' ? 'Alguns convites não foram enviados; use "Reenviar convites".' : 'Os convites foram enviados por e-mail.'}
          </p>
        )}
        {searchParams?.reenviado && <p className="mt-4 rounded-lg bg-mar-50 px-4 py-3 text-sm text-mar-700" role="status">Convites reenviados.</p>}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-titulo text-3xl font-bold">{r.title}</h1>
            <p className="mt-1 text-tinta/65">
              {r.startsAt ? `${formatarDataLonga(r.startsAt)} · ${r.durationMin || 60} min` : `Reunião instantânea · criada em ${formatarDataHora(r.createdAt)}`}
            </p>
          </div>
          {r.cancelledAt ? <span className="selo bg-red-50 text-red-700">Cancelada</span> : <Link href={`/r/${r.code}`} className="btn-primario">Entrar na reunião</Link>}
        </div>

        {!r.cancelledAt && (
          <section className="cartao mt-6 space-y-4">
            <div>
              <p className="rotulo">Link para os participantes</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <code className="flex-1 truncate rounded-lg bg-areia px-3 py-2.5 text-sm">{url}</code>
                <Copiar texto={url} />
              </div>
            </div>
            <form action={acaoSalaEspera} className="flex items-center justify-between gap-3 rounded-lg bg-areia p-3 text-sm">
              <input type="hidden" name="id" value={r.id} />
              <span><strong>Sala de espera {r.waitingRoom ? 'ligada' : 'desligada'}</strong><br /><span className="text-tinta/65">{r.waitingRoom ? 'Convidados entram quando você aceitar.' : 'Quem tiver o link entra direto.'}</span></span>
              <button className="btn-secundario shrink-0 px-3 py-2 text-sm">{r.waitingRoom ? 'Desligar' : 'Ligar'}</button>
            </form>
          </section>
        )}

        {r.invites.length > 0 && (
          <section className="cartao mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-titulo text-xl font-bold">Convidados</h2>
              {futura && !r.cancelledAt && (
                <form action={acaoReenviarConvites}><input type="hidden" name="id" value={r.id} /><button className="btn-secundario px-3 py-2 text-sm">Reenviar convites</button></form>
              )}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {r.invites.map((i) => <li key={i.id} className="rounded-full bg-areia px-3 py-1 text-sm">{i.email}</li>)}
            </ul>
          </section>
        )}

        <section className="cartao mt-6">
          <h2 className="font-titulo text-xl font-bold">Gravações e atas</h2>
          <p className="mt-1 text-sm text-tinta/60">Para gravar, use o botão de gravação dentro da reunião. A gravação aparece aqui quando termina; a ata é um rascunho feito por IA para você revisar.</p>
          {erro && <p className="mt-3 text-sm text-red-700">Não foi possível carregar as gravações agora.</p>}
          {!erro && !lista.length && <p className="mt-4 text-tinta/60">Nenhuma gravação desta reunião.</p>}
          <ul className="mt-2 divide-y divide-tinta/10">
            {lista.map((g) => (
              <li key={g.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatarDataHora(g.createdAt)}</p>
                    <p className="text-sm text-tinta/60">{duracao(g.durationSec)} · {tamanho(g.sizeBytes)} · fica guardada até {formatarDataHora(g.expiresAt)} <SituacaoAta ata={g.ata} /></p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/gravacoes/${g.id}/baixar?reuniao=${r.id}`} className="btn-secundario px-3 py-2 text-sm">Baixar vídeo</a>
                    {(!g.ata || g.ata.status === 'FAILED') && (
                      <form action={acaoGerarAta}><input type="hidden" name="reuniao" value={r.id} /><input type="hidden" name="gravacao" value={g.id} /><button className="btn-secundario px-3 py-2 text-sm">Gerar ata</button></form>
                    )}
                    <form action={acaoApagarGravacao}><input type="hidden" name="reuniao" value={r.id} /><input type="hidden" name="gravacao" value={g.id} /><button className="btn-perigo px-3 py-2 text-sm">Apagar</button></form>
                  </div>
                </div>
                {g.ata?.status === 'DONE' && (
                  <details className="mt-3 rounded-lg bg-areia p-4">
                    <summary className="cursor-pointer font-semibold">Ver ata</summary>
                    <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{g.ata.minutes || `(sem ata: ${g.ata.error || 'não gerada'})`}</div>
                    {g.ata.text && <details className="mt-4"><summary className="cursor-pointer text-sm text-tinta/70">Transcrição completa</summary><p className="mt-2 whitespace-pre-wrap text-sm text-tinta/80">{g.ata.text}</p></details>}
                  </details>
                )}
                {g.ata?.status === 'FAILED' && <p className="mt-2 text-sm text-red-700">{g.ata.error}</p>}
              </li>
            ))}
          </ul>
        </section>

        {!r.cancelledAt && futura && (
          <form action={acaoCancelar} className="mt-8 text-right">
            <input type="hidden" name="id" value={r.id} />
            <button className="btn-perigo">Cancelar reunião e avisar convidados</button>
          </form>
        )}
      </main>
    </>
  );
}
