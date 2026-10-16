# Jibri (gravação) — fase 6

Conferido em 16/10/2026 contra o `docker-jitsi-meet` oficial (tag
`stable-11248`) e o código do Jibri.

## Como a gravação funciona

1. O cliente (SeuCartório) pede o token à meet-ayio-api. O token de
   **moderador** vem com `context.features.recording = true`, e o botão
   "Iniciar gravação" aparece no menu do Jitsi.
2. O moderador inicia e para a gravação na chamada. O jicofo chama um Jibri
   livre, que abre a sala num Chrome sem tela e grava em mp4
   (`<sala>_AAAA-MM-DD-HH-mm-ss.mp4` + `metadata.json` com `meeting_url`).
3. Ao terminar, o Jibri roda `finalize.sh <pasta da sessão>`, que envia o
   arquivo para `PUT /internal/recordings` da API (autenticado por
   `RECORDER_SECRET`).
4. A API guarda no storage, registra no banco e manda o webhook
   `recording.ready` assinado. Se a transcrição estiver ligada para o
   cliente, gera transcrição e ata (`transcript.ready`).
5. Depois de `recordingRetentionDays` (padrão 30), a API apaga sozinha.

Se o envio falhar, a pasta fica em `storage/recordings` com `.falhou` e o
`retry-pending.sh` reenvia (cron a cada 15 min). Testado ponta a ponta.

## Onde rodar

- **VPS (recomendado):** 2 vCPU / 4 GB RAM por gravação simultânea. Um Jibri
  grava **uma** sala por vez; para gravações simultâneas, um container por
  gravação (com `JIBRI_INSTANCE_ID` diferente).
- **Railway: não serve.** O container exige `/dev/shm` de pelo menos 2 GB e
  aborta o boot se for menor (`shm-check`); o Railway não permite ajustar isso.
- Boa notícia da `stable-11248`: o áudio é capturado por PulseAudio dentro do
  container. **Não** precisa mais do módulo `snd-aloop`, de `/dev/snd` nem de
  `SYS_ADMIN` (exigências de versões antigas).

## Passo a passo

1. **Railway, prosody:** criar um TCP proxy para a porta **5222** (o Jibri de
   fora fala XMPP). O host:porta vai em `XMPP_SERVER`.
2. **Railway, variáveis:**

   | Serviço | Variáveis |
   |---|---|
   | prosody | `ENABLE_RECORDING=1`, `JIBRI_XMPP_USER=jibri`, `JIBRI_XMPP_PASSWORD`, `JIBRI_RECORDER_USER=recorder`, `JIBRI_RECORDER_PASSWORD`, `XMPP_HIDDEN_DOMAIN=hidden.meet.jitsi` |
   | jicofo | `ENABLE_RECORDING=1`, `JIBRI_BREWERY_MUC=jibribrewery` |
   | web | `ENABLE_RECORDING=1` (mostra o botão) |

   Com `ENABLE_RECORDING=1`, o prosody **cria sozinho** os usuários
   `jibri@auth...` e `recorder@hidden...` com essas senhas no boot. Com
   `AUTH_TYPE=jwt`, ele também grava os dados do token (quem gravou) no
   `metadata.json`.
3. **API:** `RECORDER_SECRET` e o storage (volume em `/data` com
   `RECORDINGS_DIR=/data/recordings`, ou bucket com `S3_*`).
4. **VPS:**
   ```bash
   cd infra/jibri && cp .env.example .env   # preencher
   mkdir -p config storage && sudo chown 1000:1000 config storage
   docker compose up -d --build
   docker logs -f jibri                     # esperar entrar no MUC jibribrewery
   ```
5. **Cron do reenvio** (na VPS):
   `*/15 * * * * docker exec jibri /opt/meet-ayio/retry-pending.sh`

## Segurança

- A porta 5222 do prosody fica exposta pelo proxy TCP: use senhas longas
  (`JIBRI_*_PASSWORD`) e, se possível, restrinja o acesso ao IP da VPS.
- O container roda como usuário `s6` (não root) e com sistema de arquivos
  somente leitura, igual ao compose oficial.

## Aviso de gravação (LGPD)

O Jitsi avisa os participantes quando a gravação começa, mas o aviso formal
(finalidade, base legal, retenção) é do cliente — ver
`plano-video-gravacao-ata-lgpd-14-10.md` no SeuCartório.
