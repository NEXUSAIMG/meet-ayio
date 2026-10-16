# Meet Ayio — app

App web do Meet Ayio para qualquer pessoa: página de abertura, login por link
no e-mail (sem senha), reunião instantânea, agendamento com convite por e-mail
(.ics), sala de espera, e gravações com ata por IA.

No ar: https://app-production-7ae6.up.railway.app (serviço `app` do projeto
`meet-ayio` no Railway).

## Como funciona

- Next.js 16 (App Router) + Tailwind + Prisma/MySQL (database `meetayio_app`,
  no mesmo servidor MySQL da API, criado sozinho no primeiro deploy).
- O app é um **cliente da meet-ayio-api** (`meet-ayio-app`, prefixo de sala
  `m-`, transcrição ligada). A chave da API fica só no servidor.
- Reunião = código `abc-defg-hij`; a sala no Jitsi é `m-abc-defg-hij`.
  Dono da reunião entra como moderador; quem tem o link entra como
  participante (convidado só informa o nome).
- A sala embute o Jitsi pela IFrame API. Com sala de espera ligada, o
  anfitrião liga o lobby ao entrar e aprova quem pede para participar.
- Login: link mágico (1 hora, uso único, só o hash no banco). O link abre uma
  página com botão "Entrar" — antivírus de e-mail que visitam o link não
  gastam o acesso. Sessão em cookie httpOnly (30 dias).
- Gravações e atas vêm da API, filtradas pela sala da reunião; só o dono vê,
  baixa, pede ata ou apaga.

## Variáveis

| Variável | Valor no Railway |
|---|---|
| `DATABASE_URL` | `mysql://${{MySQL.MYSQLUSER}}:${{MySQL.MYSQLPASSWORD}}@${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/meetayio_app` |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (ou o domínio próprio) |
| `MEET_AYIO_API_URL` | `http://api.railway.internal:3000` |
| `MEET_AYIO_API_KEY` | chave do cliente `meet-ayio-app` (no `.env` da raiz) |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mail (Resend). **Sem eles o link de login e os convites só aparecem no log do serviço.** |
| `CONTATO_EMAIL` | opcional: mostra "Falar com a equipe" no plano de empresas |
| `PORT` | `3000` |

## Rodar localmente

```bash
cd app
npm install
# .env com DATABASE_URL (MySQL local), APP_URL=http://localhost:3100 e a chave da API
npx prisma migrate deploy
npm run dev        # http://localhost:3100
npm test
```
