# Plano - Meet Ayio (atualizado 16/10/2026, tarde)

Produto à parte com API própria (SeuCartório é o primeiro cliente; BotAyio,
GestaoNexus etc. depois), hospedado no Railway, com gravação (Jibri) no v1.

## Por que
O SeuCartório depende do 8x8 JaaS, que cobra por MAU e trava a entrada na sala
quando o limite estoura (persistiu mesmo após upgrade; incidente aberto com a
8x8). Meet Ayio = infraestrutura Jitsi própria, sem limite de MAU nem custo
por minuto de gravação.

## Mídia no Railway
O "TCP harvester" do JVB não serve: o único harvester ICE do JVB atual é UDP,
e um deploy Jitsi padrão no Railway perde áudio/vídeo quando entra o 3º
participante. O caminho que funciona é **TURN sobre TCP com coturn** num TCP
proxy do Railway (3478): navegador -> coturn -> UDP privado -> JVB.

O stack (`infra/servicos/`) foi **reescrito do zero** sobre as imagens
oficiais `docker-jitsi-meet` `stable-11248` (Apache 2.0): não depende mais do
template sem licença. Sem volumes, JWT e moderador vindo do token fixos nas
imagens, coturn que só repassa para o jvb. Variáveis por serviço em
`infra/README.md`.

## Gravação
Moderador inicia/para na chamada (token com `features.recording`) -> Jibri
grava -> `finalize.sh` envia o mp4 para a API -> storage (volume ou bucket) ->
webhook `recording.ready` assinado -> apagamento automático na retenção do
cliente (padrão 30 dias). Jibri na **VPS**: a `stable-11248` não precisa mais
de `snd-aloop`/`SYS_ADMIN`, mas exige `/dev/shm` de 2 GB, o que o Railway não
oferece. Fala com o prosody por um TCP proxy no 5222.

## Fases
1. ~~Validar UDP~~ - feito; caminho é TURN/TCP com coturn.
2. **Deploy do stack (`infra/`) no Railway** - aguardando ok do Marcio
   (gera cobrança). Segredos já gerados localmente (`scripts/gerar-segredos.js`).
3. Teste real com 3+ pessoas (Davi, Karina; wifi, 4G, rede do cartório);
   medir banda do coturn; conferir moderador vindo do token.
4. ~~API~~ - feito: clientes, API keys, prefixo de sala, tokens, uso.
5. SeuCartório -> Meet Ayio - **aplicado no branch `feat/meet-ayio`** do
   SeuCartório (local, sem push). Padrão `VIDEO_PROVIDER=jaas`.
6. Gravação - **API e script prontos e testados**. Falta: subir o Jibri numa
   VPS e ligar `ENABLE_RECORDING` no stack.
7. Ata automática - **pronta e testada**. Falta: `TRANSCRIBE_API_KEY` (Groq)
   e `ANTHROPIC_API_KEY` no deploy.
8. Operação - **pronta (v0.5, 16/10)**: painel `/admin/painel` (saúde,
   clientes, uso, quotas, gravações), `GET /admin/health`, `/health/ready`
   para monitor externo, quotas opcionais por cliente (padrão sem limite).

## Decisões em aberto
- Domínio (ex.: `meet.ayio.com.br`; API em `api.meet.ayio.com.br`).
- Storage das gravações: volume do Railway ou Railway Bucket.
- VPS do Jibri (provedor/tamanho; 1 gravação simultânea por container).
- Valores de quota por cliente (o mecanismo existe; hoje todos sem limite).
- Atas de atos notariais: se alguma videoconferência for ato notarial, a
  guarda da gravação segue regra própria - conferir antes de usar a
  retenção padrão de 30 dias para esses casos.
- Monitor externo (ex.: UptimeRobot em `/health/ready`) e alerta.
- GitHub: repo `marciogoes/meet-ayio` ainda não criado (código só local).
