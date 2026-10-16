import { redirect } from 'next/navigation';
import { Marca } from '@/componentes/Marca';
import { usuarioAtual } from '@/lib/auth';
import { caminhoSeguro } from '@/lib/util.mjs';
import { FormLogin } from './FormLogin';

export const metadata = { title: 'Entrar' };

export default async function Entrar(props) {
  const searchParams = await props.searchParams;
  const proximo = caminhoSeguro(searchParams?.next);
  if (await usuarioAtual()) redirect(proximo);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Marca />
      <div className="cartao mt-8 w-full max-w-sm">
        <h1 className="mb-1 font-titulo text-2xl font-bold">Entrar</h1>
        <p className="mb-6 text-sm text-tinta/65">Para criar e agendar reuniões. Convidados não precisam de conta.</p>
        <FormLogin proximo={proximo} />
      </div>
      {searchParams?.erro === 'link' && (
        <p className="mt-4 max-w-sm text-center text-sm text-red-700">Esse link expirou ou já foi usado. Peça um novo acima.</p>
      )}
    </main>
  );
}
