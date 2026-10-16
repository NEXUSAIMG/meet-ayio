'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/auth';
import { criarReuniao, enviarConvites, reuniaoDoDono } from '@/lib/reunioes';
import { lerEmails, lerDataLocal, codigoValido, salaDoCodigo } from '@/lib/util.mjs';
import { detalheGravacao, pedirTranscricao, apagarGravacao } from '@/lib/meetAyio';

export async function acaoNovaReuniao() {
  const u = await exigirUsuario();
  const r = await criarReuniao({ dono: u, titulo: `Reunião de ${(u.name || u.email).split(' ')[0]}` });
  redirect(`/r/${r.code}`);
}

export async function acaoEntrarComCodigo(form) {
  const bruto = String(form.get('codigo') || '').trim().toLowerCase();
  const codigo = bruto.replace(/^.*\/r\//, '').replace(/[^a-z-]/g, '');
  redirect(codigoValido(codigo) ? `/r/${codigo}` : '/reunioes?erro=codigo');
}

export async function acaoAgendar(_estado, form) {
  const u = await exigirUsuario('/reunioes/agendar');
  const titulo = String(form.get('titulo') || '').trim().slice(0, 120);
  const inicio = lerDataLocal(form.get('inicio'), Number(form.get('offset')));
  const duracaoMin = Math.min(Math.max(Number(form.get('duracao')) || 60, 15), 480);
  const { validos, invalidos, excedeu } = lerEmails(form.get('convidados'));
  const erros = {};
  if (titulo.length < 2) erros.titulo = 'Dê um nome para a reunião.';
  if (!inicio) erros.inicio = 'Escolha a data e a hora.';
  else if (inicio < new Date(Date.now() - 5 * 60_000)) erros.inicio = 'Essa data já passou.';
  if (invalidos.length) erros.convidados = `E-mail inválido: ${invalidos.slice(0, 3).join(', ')}`;
  if (excedeu) erros.convidados = 'No máximo 50 convidados.';
  if (Object.keys(erros).length) return { erros };

  const r = await criarReuniao({ dono: u, titulo, inicio, duracaoMin, salaEspera: form.get('salaEspera') === 'on', convidados: validos });
  const envio = await enviarConvites(r, u);
  redirect(`/reunioes/${r.id}?agendada=1&falhas=${envio.falhas}${envio.simulados ? '&email=off' : ''}`);
}

export async function acaoCancelar(form) {
  const u = await exigirUsuario();
  const r = await reuniaoDoDono(String(form.get('id')), u.id);
  if (!r || r.cancelledAt) redirect('/reunioes');
  const cancelada = await db.meeting.update({ where: { id: r.id }, data: { cancelledAt: new Date() }, include: { invites: true } });
  await enviarConvites(cancelada, u, { cancelado: true, sequencia: 1 });
  redirect(`/reunioes/${r.id}`);
}

export async function acaoReenviarConvites(form) {
  const u = await exigirUsuario();
  const r = await reuniaoDoDono(String(form.get('id')), u.id);
  if (r && !r.cancelledAt) await enviarConvites(r, u);
  redirect(`/reunioes/${r?.id || ''}?reenviado=1`);
}

export async function acaoSalaEspera(form) {
  const u = await exigirUsuario();
  const r = await reuniaoDoDono(String(form.get('id')), u.id);
  if (r) await db.meeting.update({ where: { id: r.id }, data: { waitingRoom: !r.waitingRoom } });
  revalidatePath(`/reunioes/${r?.id}`);
}

// Gravações: só o dono da reunião mexe, e só nas gravações da sala dela.
async function gravacaoDoDono(form) {
  const u = await exigirUsuario();
  const r = await reuniaoDoDono(String(form.get('reuniao')), u.id);
  if (!r) return null;
  const g = await detalheGravacao(String(form.get('gravacao'))).catch(() => null);
  return g && g.roomName === salaDoCodigo(r.code) ? { r, g } : null;
}

export async function acaoGerarAta(form) {
  const alvo = await gravacaoDoDono(form);
  if (alvo) await pedirTranscricao(alvo.g.id).catch((e) => console.error('[ata]', e.message));
  revalidatePath(`/reunioes/${alvo?.r.id}`);
}

export async function acaoApagarGravacao(form) {
  const alvo = await gravacaoDoDono(form);
  if (alvo) await apagarGravacao(alvo.g.id);
  revalidatePath(`/reunioes/${alvo?.r.id}`);
}
