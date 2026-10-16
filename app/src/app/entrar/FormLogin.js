'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { acaoPedirLink } from '../acoes-conta';

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn-primario w-full" disabled={pending}>{pending ? 'Enviando…' : 'Receber link de acesso'}</button>;
}

export function FormLogin({ proximo }) {
  const [estado, acao] = useActionState(acaoPedirLink, null);
  if (estado?.ok) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-mar-50 text-2xl" aria-hidden="true">✉️</div>
        <h2 className="font-titulo text-2xl font-bold">Confira seu e-mail</h2>
        <p className="mt-2 text-tinta/70">Mandamos um link para <strong className="text-tinta">{estado.email}</strong>. Ele vale por 15 minutos.</p>
        <p className="mt-4 text-sm text-tinta/60">Não chegou? Veja a caixa de spam ou <a href="/entrar" className="font-semibold text-mar-600 underline">tente de novo</a>.</p>
      </div>
    );
  }
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="next" value={proximo || ''} />
      <div>
        <label htmlFor="email" className="rotulo">Seu e-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="campo" placeholder="voce@empresa.com.br" autoFocus />
      </div>
      {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{estado.erro}</p>}
      <Enviar />
      <p className="text-center text-xs text-tinta/55">Sem senha: você recebe um link para entrar. Primeira vez? A conta é criada na hora.</p>
    </form>
  );
}
