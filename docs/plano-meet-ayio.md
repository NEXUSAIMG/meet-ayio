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
7. Ata automática — **pronta e testada (v0.4, 16/10)** no Meet Ayio:
   ffmpeg extrai/corta o áudio (sem o limite de 25 MB do Whisper), Groq
   Whisper transcreve com tempos, Claude redige o rascunho (regras de
   fidelidade fixas, formato trocável por cliente), participantes vindos dos
   tokens, webhook `transcript.ready`, refazer ata com lista de presença,
   fila que retoma após reinício, `recording.deleted` para o cliente apagar
   cópias. Lado do SeuCartório **preparado** (campos de ata no
   `VideoGravacao`, rotas solicitar/refazer/ler). Opt-in por cliente
   (`transcriptionEnabled`). Falta: chaves `TRANSCRIBE_API_KEY` (Groq) e
   `ANTHROPIC_API_KEY` no deploy.

## Decisões em aberto
- Domínio (ex.: `meet.ayio.com.br`; API em `api.meet.ayio.com.br`).
- Storage das gravações: volume do Railway ou Railway Bucket.
- VPS do Jibri (provedor/tamanho; 1 gravação simultânea por container).
- Quotas por cliente no v1 ou só controle de acesso (hoje: acesso + `/usage`).
- Atas de atos notariais: se alguma videoconferência for ato notarial, a
  guarda da gravação segue regra própria — conferir antes de usar a
  retenção padrão de 30 dias para esses casos.
- Licença do template upstream (sem LICENSE no repo).
- GitHub: repo `marciogoes/meet-ayio` ainda não criado (código só local).
