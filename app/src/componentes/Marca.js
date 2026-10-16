import Link from 'next/link';

// Logotipo: duas "janelas" de vídeo sobrepostas + nome.
export function Marca({ claro = false, href = '/' }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Meet Ayio — início">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="7" width="19" height="15" rx="4" fill={claro ? '#ffffff' : '#14213d'} />
        <rect x="11" y="11" width="19" height="15" rx="4" fill="#1f8a8a" />
        <circle cx="20.5" cy="18.5" r="3" fill="#f4b740" />
      </svg>
      <span className={`font-titulo text-xl font-bold tracking-tight ${claro ? 'text-white' : 'text-tinta'}`}>Meet Ayio</span>
    </Link>
  );
}
