import Link from 'next/link';
import { Marca } from './Marca';

// Barra de cima das páginas internas.
export function Topo({ usuario }) {
  return (
    <header className="border-b border-tinta/10 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Marca href={usuario ? '/reunioes' : '/'} />
        {usuario ? (
          <nav className="flex items-center gap-1 text-sm sm:gap-3">
            <Link href="/reunioes" className="rounded-md px-2 py-1.5 font-medium hover:bg-areia">Reuniões</Link>
            <Link href="/conta" className="hidden max-w-[180px] truncate rounded-md px-2 py-1.5 text-tinta/70 hover:bg-areia sm:inline">{usuario.name || usuario.email}</Link>
            <form action="/sair" method="post"><button className="rounded-md px-2 py-1.5 text-tinta/70 hover:bg-areia">Sair</button></form>
          </nav>
        ) : (
          <Link href="/entrar" className="btn-secundario">Entrar</Link>
        )}
      </div>
    </header>
  );
}
