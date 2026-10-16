import './globals.css';
import { Fraunces, Figtree } from 'next/font/google';

const titulo = Fraunces({ subsets: ['latin'], weight: ['600', '700'], variable: '--fonte-titulo', display: 'swap' });
const texto = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fonte-texto', display: 'swap' });

export const metadata = {
  title: { default: 'Meet Ayio — reuniões por vídeo com ata automática', template: '%s · Meet Ayio' },
  description: 'Reuniões por vídeo no navegador, sem instalar nada. Agende, convide por e-mail, grave e receba o rascunho da ata gerado por IA.',
};

export const viewport = { themeColor: '#14213d' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${texto.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
