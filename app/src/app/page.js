import Link from 'next/link';
import { Marca } from '@/componentes/Marca';
import { usuarioAtual } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const RECURSOS = [
  ['Sem instalar nada', 'Abre no navegador do computador ou do celular. Convidados entram só com o link, sem criar conta.'],
  ['Agenda com convite', 'Marque dia e hora, digite os e-mails e cada convidado recebe o link e o convite para a agenda dele.'],
  ['Sala de espera', 'Você decide quem entra. Os convidados aguardam até você aceitar.'],
  ['Gravação na nuvem', 'Grave pelo botão da reunião. O vídeo fica disponível para baixar e é apagado sozinho no prazo definido.'],
  ['Ata por IA', 'A gravação vira transcrição e um rascunho de ata organizado por assunto, decisões e pendências, pronto para revisar.'],
  ['Feito no Brasil', 'Interface em português, horário de Brasília e suporte da equipe Ayio.'],
];

const PASSOS = [
  ['Entre com seu e-mail', 'Sem senha: você recebe um link e já está dentro.'],
  ['Crie ou agende a reunião', 'Comece agora ou escolha data e hora e convide por e-mail.'],
  ['Converse, grave e receba a ata', 'Depois da reunião, a gravação e o rascunho da ata ficam na página da reunião.'],
];

const PERGUNTAS = [
  ['Os convidados precisam de conta?', 'Não. Quem recebe o link digita o nome e entra. Só quem cria e agenda reuniões precisa entrar com e-mail.'],
  ['Funciona no celular?', 'Sim, pelo navegador do celular (Chrome ou Safari), sem instalar aplicativo.'],
  ['A ata é confiável?', 'É um rascunho feito por IA a partir da transcrição, marcado para revisão. Ela não inventa falas, mas pode errar nomes e trechos com áudio ruim — revise antes de usar.'],
  ['Quanto tempo a gravação fica guardada?', 'Por padrão, 30 dias. Depois disso o vídeo, a transcrição e a ata são apagados automaticamente. Você também pode apagar antes.'],
];

// Ilustração do produto (sem foto de banco de imagem): grade de vídeo + cartão de ata.
function Ilustracao() {
  const pessoas = [['#1f8a8a', 'AN'], ['#f4b740', 'DS'], ['#24324f', 'KM'], ['#115557', 'RP']];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="rounded-3xl bg-tinta p-3 shadow-2xl shadow-tinta/30">
        <div className="grid grid-cols-2 gap-2">
          {pessoas.map(([cor, ini], i) => (
            <div key={ini} className="relative grid aspect-video place-items-center rounded-xl" style={{ background: i === 0 ? '#2b3d63' : '#1b2a47' }}>
              <span className="grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-white" style={{ background: cor }}>{ini}</span>
              {i === 0 && <span className="absolute inset-0 rounded-xl ring-2 ring-sol-400" />}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {['🎙', '📷', '⏺', '✋'].map((ic) => <span key={ic} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm">{ic}</span>)}
          <span className="grid h-9 w-14 place-items-center rounded-full bg-red-500 text-xs font-bold text-white">Sair</span>
        </div>
      </div>
      <div className="absolute -bottom-10 -right-2 w-60 rotate-2 rounded-2xl border border-tinta/10 bg-white p-4 shadow-xl sm:-right-10">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mar-600">Rascunho de ata</p>
        <p className="mt-1 font-titulo text-sm font-bold">Alinhamento semanal</p>
        <ul className="mt-2 space-y-1.5 text-xs text-tinta/75">
          <li>✔ Decidido: lançar na segunda</li>
          <li>✔ Ana revisa o contrato</li>
          <li>◻ Pendente: orçamento final</li>
        </ul>
      </div>
    </div>
  );
}

export default async function Inicio() {
  const u = await usuarioAtual();
  const comecar = u ? '/reunioes' : '/entrar';
  const contato = process.env.CONTATO_EMAIL;
  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Marca />
        <nav className="flex items-center gap-2">
          {!u && <Link href="/entrar" className="hidden rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white sm:inline">Entrar</Link>}
          <Link href={comecar} className="btn-primario px-4 py-2 text-sm">{u ? 'Minhas reuniões' : 'Começar grátis'}</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <span className="selo bg-mar-50 text-mar-700">Novo · gravação com ata automática</span>
          <h1 className="mt-5 font-titulo text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Reuniões por vídeo que <span className="text-mar-600">terminam com a ata pronta.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-tinta/70">
            Crie uma sala em um clique, agende e convide por e-mail. Grave a conversa e receba a transcrição e um rascunho de ata gerado por IA.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={comecar} className="btn-primario px-6 py-3 text-base">{u ? 'Ir para minhas reuniões' : 'Começar grátis'}</Link>
            <a href="#como-funciona" className="btn-secundario px-6 py-3 text-base">Como funciona</a>
          </div>
          <p className="mt-4 text-sm text-tinta/55">Entre só com o e-mail. Sem cartão de crédito.</p>
        </div>
        <Ilustracao />
      </section>

      <section id="como-funciona" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-titulo text-3xl font-bold sm:text-4xl">Como funciona</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {PASSOS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-areia p-6">
                <span className="font-titulo text-4xl font-bold text-mar-500">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold">{t}</h3>
                <p className="mt-1 text-tinta/70">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="max-w-2xl font-titulo text-3xl font-bold sm:text-4xl">Tudo o que a reunião precisa, nada que atrapalhe</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map(([t, d]) => (
              <div key={t} className="cartao">
                <h3 className="text-lg font-bold">{t}</h3>
                <p className="mt-1.5 text-tinta/70">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-tinta py-20 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="font-titulo text-3xl font-bold sm:text-4xl">Planos</h2>
            <p className="mt-3 text-white/70">Estamos em lançamento. Use à vontade e conte o que achou.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 text-tinta">
              <p className="text-sm font-bold uppercase tracking-wider text-mar-600">Lançamento</p>
              <p className="mt-2 font-titulo text-4xl font-bold">Grátis</p>
              <ul className="mt-4 space-y-2 text-sm text-tinta/75">
                <li>✔ Reuniões e agendamentos</li><li>✔ Convites por e-mail</li><li>✔ Sala de espera</li><li>✔ Gravação e ata*</li>
              </ul>
              <Link href={comecar} className="btn-primario mt-6 w-full">Começar</Link>
            </div>
            <div className="rounded-2xl border border-white/15 p-6">
              <p className="text-sm font-bold uppercase tracking-wider text-sol-400">Empresas e sistemas</p>
              <p className="mt-2 font-titulo text-2xl font-bold">API do Meet Ayio</p>
              <p className="mt-3 text-sm text-white/70">Coloque videoconferência com gravação e ata dentro do seu sistema, com a sua marca e sem limite de usuários por mês.</p>
              {contato && <a href={`mailto:${contato}?subject=API%20do%20Meet%20Ayio`} className="btn-sol mt-6 w-full">Falar com a equipe</a>}
            </div>
          </div>
          <p className="text-xs text-white/50 lg:col-span-2">* A gravação e a ata podem ter limites de uso por conta durante o lançamento.</p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="font-titulo text-3xl font-bold sm:text-4xl">Perguntas frequentes</h2>
          <div className="mt-8 divide-y divide-tinta/10 rounded-2xl border border-tinta/10 bg-white">
            {PERGUNTAS.map(([p, r]) => (
              <details key={p} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{p}<span className="text-mar-600 transition group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-tinta/70">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-3xl bg-mar-600 px-6 py-14 text-center text-white">
          <h2 className="font-titulo text-3xl font-bold sm:text-4xl">Sua próxima reunião já pode ter ata.</h2>
          <Link href={comecar} className="btn-sol mt-8 px-6 py-3 text-base">{u ? 'Ir para minhas reuniões' : 'Começar grátis'}</Link>
        </div>
      </section>

      <footer className="border-t border-tinta/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-tinta/55 sm:flex-row">
          <Marca />
          <p>© {new Date().getFullYear()} Ayio. Reuniões por vídeo com gravação e ata.</p>
        </div>
      </footer>
    </div>
  );
}
