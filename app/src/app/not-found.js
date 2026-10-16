import Link from 'next/link';
import { Marca } from '@/componentes/Marca';

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Marca />
      <div className="cartao mt-8 max-w-md">
        <h1 className="font-titulo text-2xl font-bold">Página não encontrada</h1>
        <p className="mt-2 text-tinta/65">O endereço pode estar errado ou a página não existe mais.</p>
        <Link href="/" className="btn-secundario mt-6">Ir para o início</Link>
      </div>
    </main>
  );
}
