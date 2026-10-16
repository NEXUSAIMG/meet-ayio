import Link from 'next/link';
import { Topo } from '@/componentes/Topo';
import { exigirUsuario } from '@/lib/auth';
import { FormAgendar } from './FormAgendar';

export const metadata = { title: 'Agendar reunião' };

export default async function Agendar() {
  const u = await exigirUsuario('/reunioes/agendar');
  return (
    <>
      <Topo usuario={u} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <Link href="/reunioes" className="text-sm text-tinta/60 hover:text-tinta">← Reuniões</Link>
        <h1 className="mb-6 mt-2 font-titulo text-3xl font-bold">Agendar reunião</h1>
        <FormAgendar />
      </main>
    </>
  );
}
