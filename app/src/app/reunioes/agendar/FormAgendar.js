'use client';
import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { acaoAgendar } from '../acoes';

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn-primario" disabled={pending}>{pending ? 'Agendando e enviando convites…' : 'Agendar e enviar convites'}</button>;
}

// Próxima hora cheia, no formato do input datetime-local.
function proximaHora() {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

export function FormAgendar() {
  const [estado, acao] = useActionState(acaoAgendar, null);
  const [offset, setOffset] = useState('');
  const [inicio, setInicio] = useState('');
  useEffect(() => { setOffset(String(new Date().getTimezoneOffset())); setInicio(proximaHora()); }, []);
  const erro = (c) => estado?.erros?.[c] && <p className="mt-1 text-sm text-red-700">{estado.erros[c]}</p>;

  return (
    <form action={acao} className="cartao space-y-5">
      <input type="hidden" name="offset" value={offset} />
      <div>
        <label htmlFor="titulo" className="rotulo">Assunto</label>
        <input id="titulo" name="titulo" required maxLength={120} className="campo" placeholder="Ex.: Reunião de alinhamento" />
        {erro('titulo')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inicio" className="rotulo">Data e hora</label>
          <input id="inicio" name="inicio" type="datetime-local" required className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          {erro('inicio')}
        </div>
        <div>
          <label htmlFor="duracao" className="rotulo">Duração</label>
          <select id="duracao" name="duracao" className="campo" defaultValue="60">
            <option value="15">15 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option>
            <option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option><option value="180">3 horas</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="convidados" className="rotulo">Convidados</label>
        <textarea id="convidados" name="convidados" rows={3} className="campo" placeholder="E-mails separados por vírgula ou um por linha" />
        <p className="mt-1 text-xs text-tinta/55">Cada um recebe o link e um convite para a agenda. Não precisam de conta.</p>
        {erro('convidados')}
      </div>
      <label className="flex items-start gap-3 rounded-lg bg-areia p-3 text-sm">
        <input type="checkbox" name="salaEspera" defaultChecked className="mt-0.5 h-4 w-4 accent-mar-600" />
        <span><strong>Sala de espera</strong><br /><span className="text-tinta/65">Convidados só entram quando você aceitar.</span></span>
      </label>
      <Enviar />
    </form>
  );
}
