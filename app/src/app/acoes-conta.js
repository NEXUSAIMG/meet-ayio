'use server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { pedirLinkLogin, exigirUsuario } from '@/lib/auth';
import { caminhoSeguro } from '@/lib/util.mjs';

export async function acaoPedirLink(_estado, form) {
  return pedirLinkLogin(form.get('email'), form.get('next'));
}

export async function acaoSalvarNome(form) {
  const u = await exigirUsuario();
  const nome = String(form.get('nome') || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (nome.length >= 2) await db.user.update({ where: { id: u.id }, data: { name: nome } });
  redirect(caminhoSeguro(form.get('next')));
}
