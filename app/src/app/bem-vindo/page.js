import { Marca } from '@/componentes/Marca';
import { exigirUsuario } from '@/lib/auth';
import { caminhoSeguro } from '@/lib/util.mjs';
import { acaoSalvarNome } from '../acoes-conta';

export const metadata = { title: 'Bem-vindo' };

export default async function BemVindo(props) {
  const searchParams = await props.searchParams;
  const u = await exigirUsuario('/bem-vindo');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Marca />
      <form action={acaoSalvarNome} className="cartao mt-8 w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-titulo text-2xl font-bold">Boas-vindas!</h1>
          <p className="mt-1 text-sm text-tinta/65">Como você quer aparecer nas reuniões?</p>
        </div>
        <input type="hidden" name="next" value={caminhoSeguro(searchParams?.next)} />
        <div>
          <label htmlFor="nome" className="rotulo">Seu nome</label>
          <input id="nome" name="nome" required minLength={2} maxLength={120} defaultValue={u.name || ''} className="campo" autoFocus autoComplete="name" />
        </div>
        <button className="btn-primario w-full">Continuar</button>
      </form>
    </main>
  );
}
