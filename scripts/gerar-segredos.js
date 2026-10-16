#!/usr/bin/env node
// Gera os segredos do Meet Ayio em arquivos .env locais (ignorados pelo git).
//   node scripts/gerar-segredos.js
// - api/.env            -> a partir de api/.env.example
// - infra/jibri/.env    -> a partir de infra/jibri/.env.example
// - .env (raiz)         -> resumo por servico do Railway, para colar nas variaveis
// Nao sobrescreve segredo que ja existe: rodar de novo so completa o que falta.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.resolve(__dirname, '..');
const gerar = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function lerEnv(arquivo) {
  const vals = {};
  if (!fs.existsSync(arquivo)) return vals;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vals[m[1]] = m[2];
  }
  return vals;
}

const PLACEHOLDER = /^(troque|igual-ao|$)/;
function valor(existente, nome, novo) {
  const atual = existente[nome];
  return atual && !PLACEHOLDER.test(atual) ? atual : novo;
}

// 1) Segredos (reaproveita os que ja existem)
const apiEnvPath = path.join(raiz, 'api', '.env');
const jibriEnvPath = path.join(raiz, 'infra', 'jibri', '.env');
const apiAtual = lerEnv(apiEnvPath);
const jibriAtual = lerEnv(jibriEnvPath);

const s = {
  JWT_APP_SECRET: valor(apiAtual, 'JWT_APP_SECRET', gerar(48)),
  ADMIN_TOKEN: valor(apiAtual, 'ADMIN_TOKEN', gerar(32)),
  RECORDER_SECRET: valor(apiAtual, 'RECORDER_SECRET', gerar(32)),
  FILES_SECRET: valor(apiAtual, 'FILES_SECRET', gerar(32)),
  JIBRI_XMPP_PASSWORD: valor(jibriAtual, 'JIBRI_XMPP_PASSWORD', gerar(24)),
  JIBRI_RECORDER_PASSWORD: valor(jibriAtual, 'JIBRI_RECORDER_PASSWORD', gerar(24)),
};

// 2) Preenche um .env a partir do .example, mantendo valores ja preenchidos
function escrever(exemplo, destino, trocas) {
  const atual = lerEnv(destino);
  const linhas = fs.readFileSync(exemplo, 'utf8').split(/\r?\n/).map((linha) => {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return linha;
    const [, nome, padrao] = m;
    if (trocas[nome] !== undefined) return `${nome}=${trocas[nome]}`;
    if (atual[nome] !== undefined) return `${nome}=${atual[nome]}`;
    return `${nome}=${padrao}`;
  });
  fs.writeFileSync(destino, linhas.join('\n'), { mode: 0o600 });
  console.log('ok', path.relative(raiz, destino));
}

escrever(path.join(raiz, 'api', '.env.example'), apiEnvPath, {
  JWT_APP_SECRET: s.JWT_APP_SECRET,
  ADMIN_TOKEN: s.ADMIN_TOKEN,
  RECORDER_SECRET: s.RECORDER_SECRET,
  FILES_SECRET: s.FILES_SECRET,
});
escrever(path.join(raiz, 'infra', 'jibri', '.env.example'), jibriEnvPath, {
  JIBRI_XMPP_PASSWORD: s.JIBRI_XMPP_PASSWORD,
  JIBRI_RECORDER_PASSWORD: s.JIBRI_RECORDER_PASSWORD,
  MEET_AYIO_RECORDER_SECRET: s.RECORDER_SECRET,
});

// 3) Resumo para o Railway (o que precisa ser IGUAL entre servicos)
const resumo = `# Segredos do Meet Ayio - gerado por scripts/gerar-segredos.js
# NAO commitar. Copiar cada bloco para as variaveis do servico no Railway.

# --- meet-ayio-api ---
ADMIN_TOKEN=${s.ADMIN_TOKEN}
JWT_APP_SECRET=${s.JWT_APP_SECRET}
RECORDER_SECRET=${s.RECORDER_SECRET}
FILES_SECRET=${s.FILES_SECRET}

# --- prosody, jicofo e web (JWT igual ao da API) ---
JWT_APP_ID=meet-ayio
JWT_APP_SECRET=${s.JWT_APP_SECRET}
JWT_ACCEPTED_ISSUERS=meet-ayio
JWT_ACCEPTED_AUDIENCES=meet-ayio

# --- prosody (gravacao) e Jibri na VPS ---
JIBRI_XMPP_PASSWORD=${s.JIBRI_XMPP_PASSWORD}
JIBRI_RECORDER_PASSWORD=${s.JIBRI_RECORDER_PASSWORD}

# --- SeuCartorio ---
# MEET_AYIO_API_KEY= (criar no painel /admin depois do deploy)
`;
fs.writeFileSync(path.join(raiz, '.env'), resumo, { mode: 0o600 });
console.log('ok .env (resumo para o Railway)');
