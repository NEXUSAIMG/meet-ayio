import { db } from './db';
import { enviarEmail, emailConvite } from './email';
import { gerarCodigo, gerarIcs } from './util.mjs';

const APP_URL = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

export async function criarReuniao({ dono, titulo, inicio = null, duracaoMin = null, salaEspera = true, convidados = [] }) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await db.meeting.create({
        data: {
          code: gerarCodigo(), ownerId: dono.id, title: titulo, startsAt: inicio, durationMin: duracaoMin, waitingRoom: salaEspera,
          invites: { create: convidados.map((email) => ({ email })) },
        },
        include: { invites: true },
      });
    } catch (e) {
      if (e.code !== 'P2002') throw e; // código repetido: tenta outro
    }
  }
  throw new Error('não foi possível gerar um código de reunião');
}

export const reuniaoDoDono = (id, donoId) => db.meeting.findFirst({ where: { id, ownerId: donoId }, include: { invites: true } });

// Convite por e-mail com o .ics anexo (anfitrião recebe também, para a própria agenda).
export async function enviarConvites(reuniao, dono, { cancelado = false, sequencia = 0 } = {}) {
  if (!reuniao.startsAt) return { enviados: 0, falhas: 0 };
  const convidados = reuniao.invites.map((i) => i.email);
  const ics = gerarIcs({
    uid: `${reuniao.id}@meet-ayio`, inicio: reuniao.startsAt, duracaoMin: reuniao.durationMin || 60, titulo: reuniao.title,
    descricao: `Reunião por vídeo no Meet Ayio.\nEntrar: ${APP_URL()}/r/${reuniao.code}`, url: `${APP_URL()}/r/${reuniao.code}`,
    organizador: { nome: dono.name, email: dono.email }, convidados, cancelado, sequencia,
  });
  const m = emailConvite({ reuniao, anfitriao: dono, cancelado });
  let enviados = 0;
  let falhas = 0;
  let simulados = 0;
  for (const para of [...convidados, dono.email]) {
    const r = await enviarEmail({
      para, assunto: m.assunto, html: m.html, texto: m.texto,
      anexos: [{ nome: cancelado ? 'cancelamento.ics' : 'convite.ics', conteudo: ics, tipo: `text/calendar; method=${cancelado ? 'CANCEL' : 'REQUEST'}` }],
    });
    if (r.simulado) simulados++; else if (r.ok) enviados++; else falhas++;
  }
  if (!cancelado && enviados) await db.invite.updateMany({ where: { meetingId: reuniao.id }, data: { sentAt: new Date() } });
  return { enviados, falhas, simulados };
}
