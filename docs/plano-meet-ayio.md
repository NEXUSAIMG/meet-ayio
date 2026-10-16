# Plano — Meet Ayio (16/10/2026, revisado 15/10 noite)

Produto à parte com API própria (SeuCartório é o primeiro cliente; BotAyio,
GestaoNexus etc. depois), hospedado no Railway, com gravação (Jibri) no v1.

## Por que
O SeuCartório depende do 8x8 JaaS, que cobra por MAU e trava a entrada na sala
quando o limite estoura (persistiu mesmo após upgrade; incidente aberto com a
8x8). Meet Ayio = infraestrutura Jitsi própria, sem limite de MAU nem custo
por minuto de gravação.

## Mídia no Railway (revisão 15/10)

O "TCP harvester" do JVB não serve: o único harvester ICE do JVB atual é UDP,
e um deploy Jitsi padrão no Railway perde áudio/vídeo quando entra o 3º
participante. O caminho que funciona é **TURN sobre TCP com coturn** num TCP
proxy do Railway (3478): navegador → coturn → UDP privado → JVB.

Template base: lNamelessl/jitsi-railway-template (5 serviços, ~3,8 GB RAM,
jvb 2 GB). Toda mídia passa pelo coturn (~US$ 10–25/mês de banda em uso leve,
estimativa do autor). TURNS/5349 opcional via 2º TCP proxy.
Descartado: template "Jitsi Meet (Just Updated)" — sem TURN.

## JWT
`ENABLE_AUTH=1`, `AUTH_TYPE=jwt`, `JWT_APP_ID`, `JWT_APP_SECRET` (HS256),
`JWT_ACCEPTED_ISSUERS`, `JWT_ACCEPTED_AUDIENCES` em prosody/web/jicofo.
HS256 basta no v1 (só a meet-ayio-api assina).

## Fases
1. ~~Validar UDP~~ — feito; caminho é TURN/TCP com coturn.
2. **Deploy do stack (`infra/`) no Railway** → moderador, teste com auth
   interna; depois JWT e domínio. ← **aguardando ok do Marcio (gera cobrança)**
3. Teste real com 3+ pessoas (Davi, Karina; wifi, 4G, rede do cartório);
   medir banda do coturn.
4. ~~API~~ — **feito (15/10, v0.2)**: Prisma/MySQL, clientes com API key
   (hash), prefixo de sala por cliente, `POST /tokens`, admin, `/usage`.
   Testada com MySQL 8.4 real e smoke ponta a ponta. Falta: deploy.
5. SeuCartório → Meet Ayio — **preparado** em `integracoes/seucartorio/`
   (provedor atrás de `VIDEO_PROVIDER=jaas|meetayio`, volta instantânea pro
   8x8). Aplicar depois da fase 3.
6. Jibri — exige privilégios elevados; alto risco no Railway → validar cedo;
   plano B: VPS pequena.
7. Webhook de gravação + ata (`plano-video-gravacao-ata-lgpd-14-10.md`).

## Decisões em aberto
- Domínio (ex.: `meet.ayio.com.br`).
- Quotas por cliente no v1 ou só controle de acesso (hoje: só acesso + `/usage`).
- Convidados: token sempre ou entrada livre com lobby. (O SeuCartório já emite
  token para convidado pelo link de convite, então `ENABLE_GUESTS=0` funciona.)
- Licença do template upstream (sem LICENSE no repo).
- GitHub: repo `marciogoes/meet-ayio` ainda não criado (código só local).
