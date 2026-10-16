import { Marca } from '@/componentes/Marca';

export const metadata = { title: 'Confirmar acesso', robots: { index: false } };

// O link do e-mail abre esta página e só o clique no botão consome o token:
// antivírus de e-mail que "visitam" o link antes da pessoa não gastam o acesso.
export default async function Verificar(props) {
  const searchParams = await props.searchParams;
  const t = typeof searchParams?.t === 'string' ? searchParams.t : '';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Marca />
      <form action="/entrar/confirmar" method="post" className="cartao mt-8 w-full max-w-sm text-center">
        <input type="hidden" name="t" value={t} />
        <h1 className="font-titulo text-2xl font-bold">Quase lá</h1>
        <p className="mb-6 mt-2 text-tinta/65">Confirme para entrar no Meet Ayio neste navegador.</p>
        <button className="btn-primario w-full" autoFocus>Entrar</button>
      </form>
    </main>
  );
}
