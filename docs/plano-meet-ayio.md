# Plano — Meet Ayio (atualizado 16/10/2026)

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
proxy do Railway (3478): navegador → coturn → UDP privado → JVB.
Template base: lNamelessl/jitsi-railway-template (5 serviços, ~3,8 GB RAM).

## Gravação
Moderador inicia/para na chamada (token com `features.recording`) → Jibri
grava → `finalize.sh` envia o mp4 para a API → storage (volume ou bucket) →
webhook `recording.ready` assinado → apagamento automático na retenção do
cliente (padrão 30 dias). Jibri na **VPS** (precisa de privilégios que o
Railway não dá); fala com o prosody por um TCP proxy no 5222.

## Fases
1. ~~Validar UDP~~ — feito; caminho é TURN/TCP com coturn.
2. **Deploy do stack (`infra/`) no Railway** ← aguardando ok do Marcio
   (gera cobrança).
3. Teste real com 3+ pessoas (Davi, Karina; wifi, 4G, rede do cartório);
   medir banda do coturn; conferir moderador vindo do token.
4. ~~API~~ — feito (v0.2): clientes, API keys, prefixo de sala, tokens, uso.
5. SeuCartório → Meet Ayio — **preparado** em `integracoes/seucartorio/`
   (`VIDEO_PROVIDER=jaas|meetayio`). Aplicar depois da fase 3.
6. Gravação — **API e script prontos e testados** (v0.3, 16/10):
   upload interno, storage local/S3, listar/baixar/apagar, webhooks com
   retentativas, retenção, uso com minutos/bytes; `finalize.sh` +
   `retry-pending.sh` testados ponta a ponta contra MySQL real.
   Falta: subir o Jibri numa VPS e ligar `ENABLE_RECORDING` no stack.
7. Webhook + ata — lado do SeuCartório **preparado** (rota do webhook com
   verificação de assinatura, model `VideoGravacao`, download/exclusão no
   painel). Falta: a ata automática em si
   (`plano-video-gravacao-ata-lgpd-14-10.md`) consumindo o `recording.ready`.

## Decisões em aberto
- Domínio (ex.: `meet.ayio.com.br`; API em `api.meet.ayio.com.br`).
- Storage das gravações: volume do Railway ou Railway Bucket.
- VPS do Jibri (provedor/tamanho; 1 gravação simultânea por container).
- Quotas por cliente no v1 ou só controle de acesso (hoje: acesso + `/usage`).
- Licença do template upstream (sem LICENSE no repo).
- GitHub: repo `marciogoes/meet-ayio` ainda não criado (código só local).
