import { Topo } from '@/componentes/Topo';
import { exigirUsuario } from '@/lib/auth';
import { acaoSalvarNome } from '../acoes-conta';

export const metadata = { title: 'Sua conta' };

export default async function Conta() {
  const u = await exigirUsuario('/conta');
  return (
    <>
      <Topo usuario={u} />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-titulo text-3xl font-bold">Sua conta</h1>
        <form action={acaoSalvarNome} className="cartao mt-6 space-y-4">
          <input type="hidden" name="next" value="/reunioes" />
          <div>
            <label className="rotulo">E-mail</label>
            <p className="text-[15px]">{u.email}</p>
          </div>
          <div>
            <label htmlFor="nome" className="rotulo">Nome nas reuniões</label>
            <input id="nome" name="nome" required minLength={2} maxLength={120} defaultValue={u.name || ''} className="campo" />
          </div>
          <button className="btn-primario">Salvar</button>
        </form>
      </main>
    </>
  );
}
