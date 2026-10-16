'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Marca } from '@/componentes/Marca';

const ERROS = {
  nome_obrigatorio: 'Digite seu nome para entrar.',
  reuniao_indisponivel: 'Esta reunião não está mais disponível.',
  servico_indisponivel: 'O serviço de vídeo não respondeu. Tente de novo em instantes.',
};

function carregarScript(src) {
  return new Promise((ok, falha) => {
    if (window.JitsiMeetExternalAPI) return ok();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = ok; s.onerror = () => falha(new Error('script'));
    document.head.appendChild(s);
  });
}

export function Sala({ codigo, titulo, quando, anfitriao, usuario, voltar }) {
  const [nome, setNome] = useState(usuario?.nome || '');
  const [fase, setFase] = useState('antes'); // antes | entrando | dentro | saiu
  const [erro, setErro] = useState('');
  const alvo = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    if (!usuario) {
      try { const salvo = localStorage.getItem('meetAyioNome'); if (salvo) setNome(salvo); } catch {}
    }
    return () => api.current?.dispose();
  }, [usuario]);

  async function entrar(ev) {
    ev?.preventDefault();
    setErro('');
    setFase('entrando');
    try {
      const r = await fetch('/api/sala/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo, nome }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!usuario) { try { localStorage.setItem('meetAyioNome', d.nome); } catch {} }
      await carregarScript(`https://${d.dominio}/external_api.js`);
      setFase('dentro');
      // espera o React desenhar o contêiner da chamada
      await new Promise((ok) => requestAnimationFrame(ok));
      api.current = new window.JitsiMeetExternalAPI(d.dominio, {
        roomName: d.sala,
        jwt: d.token,
        parentNode: alvo.current,
        width: '100%',
        height: '100%',
        lang: 'ptBR',
        userInfo: { displayName: d.nome },
        configOverwrite: {
          subject: titulo,
          prejoinConfig: { enabled: true },
          disableDeepLinking: true,
          // sem o botão de gravar quando a quota/gravação não está liberada
          ...(d.gravacao ? {} : { fileRecordingsEnabled: false }),
        },
        interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, SHOW_WATERMARK_FOR_GUESTS: false, MOBILE_APP_PROMO: false },
      });
      api.current.addListener('videoConferenceJoined', () => {
        if (d.moderador && d.salaEspera) api.current.executeCommand('toggleLobby', true);
      });
      api.current.addListener('readyToClose', () => {
        api.current?.dispose();
        api.current = null;
        setFase('saiu');
      });
    } catch (e) {
      setErro(ERROS[e.message] || 'Não foi possível entrar agora. Tente de novo.');
      setFase('antes');
    }
  }

  if (fase === 'dentro') {
    return <div ref={alvo} className="fixed inset-0 bg-[#1e1e1e]" />;
  }

  if (fase === 'saiu') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Marca />
        <div className="cartao mt-8 max-w-sm">
          <h1 className="font-titulo text-2xl font-bold">Você saiu da reunião</h1>
          <p className="mt-2 text-tinta/65">{titulo}</p>
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={() => entrar()} className="btn-primario">Voltar para a reunião</button>
            <Link href={voltar} className="btn-secundario">{usuario ? 'Ir para minhas reuniões' : 'Ir para o início'}</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-tinta p-6 text-white sm:p-10">
        <Marca claro />
        <div className="my-10">
          <p className="text-sm uppercase tracking-widest text-sol-400">Reunião por vídeo</p>
          <h1 className="mt-3 font-titulo text-3xl font-bold leading-tight sm:text-4xl">{titulo}</h1>
          <p className="mt-3 text-white/75">{quando ? `${quando} · ` : ''}com {anfitriao}</p>
        </div>
        <p className="text-sm text-white/55">Funciona no navegador do computador ou do celular. Não precisa instalar nada.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
          <h2 className="font-titulo text-2xl font-bold">{usuario?.dono ? 'Você é o anfitrião' : 'Pronto para entrar?'}</h2>
          {usuario?.nome ? (
            <p className="text-tinta/65">Você vai entrar como <strong className="text-tinta">{usuario.nome}</strong>{usuario.dono ? ', com controle da reunião.' : '.'}</p>
          ) : (
            <div>
              <label htmlFor="nome" className="rotulo">Seu nome</label>
              <input id="nome" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} className="campo" autoFocus autoComplete="name" />
            </div>
          )}
          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{erro}</p>}
          <button className="btn-primario w-full" disabled={fase === 'entrando'}>{fase === 'entrando' ? 'Preparando a sala…' : 'Entrar na reunião'}</button>
          <p className="text-xs text-tinta/55">Na próxima tela você testa câmera e microfone antes de entrar. O anfitrião pode gravar a reunião; quando a gravação começa, todos veem um aviso na tela.</p>
          {!usuario && <p className="text-sm text-tinta/60">Tem conta? <Link href={`/entrar?next=/r/${codigo}`} className="font-semibold text-mar-600 underline">Entre</Link> para usar seu nome.</p>}
        </form>
      </section>
    </main>
  );
}
