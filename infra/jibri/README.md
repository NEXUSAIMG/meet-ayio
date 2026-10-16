# Jibri (gravação) — fase 6

## Como a gravação funciona

1. O SeuCartório (ou outro cliente) pede o token à meet-ayio-api. Para
   **moderador**, o token vem com `context.features.recording = true`; o botão
   "Iniciar gravação" aparece no menu do Jitsi.
2. O moderador inicia e para a gravação na chamada. O jicofo chama um Jibri
   livre, que abre a sala num Chrome sem tela e grava em mp4.
3. Ao terminar, o Jibri roda `finalize.sh <pasta>`, que envia o arquivo para
   `PUT /internal/recordings` da API (autenticado por `RECORDER_SECRET`).
4. A API guarda no storage (volume ou bucket S3), registra no banco e manda o
   webhook `recording.ready` assinado para o cliente.
5. Depois de `recordingRetentionDays` (padrão 30), a API apaga sozinha.

Se o envio falhar, a pasta fica no disco do Jibri com `.falhou` e o
`retry-pending.sh` reenvia (cron a cada 15 min). Testado ponta a ponta em
15–16/10: envio de 3 MB, webhook, download íntegro, falha → reenvio, API fora
do ar → gravação preservada.

## Onde rodar

- **Railway (tentar primeiro? não recomendo):** o Jibri precisa de
  `SYS_ADMIN`, `/dev/snd` (módulo `snd-aloop` do kernel do host) e `shm` de
  2 GB. O Railway não dá privilégios nem acesso a módulos do kernel, então a
  chance de funcionar é muito baixa.
- **VPS (plano B, recomendado):** 2 vCPU / 4 GB RAM por gravação simultânea
  (Hetzner, Contabo, Magalu Cloud...). Um Jibri grava **uma** sala por vez;
  para gravações simultâneas, um container por gravação.

## Passo a passo (VPS)

1. **No Railway, prosody:** criar um TCP proxy para a porta **5222** (o Jibri
   de fora precisa falar XMPP). Anotar host e porta → `XMPP_SERVER`/`XMPP_PORT`.
2. **No Railway, variáveis** (prosody, jicofo e web):
   ```
   ENABLE_RECORDING=1
   JIBRI_XMPP_USER=jibri
   JIBRI_XMPP_PASSWORD=<senha forte>
   JIBRI_RECORDER_USER=recorder
   JIBRI_RECORDER_PASSWORD=<senha forte>
   JIBRI_BREWERY_MUC=jibribrewery
   ```
   (web também precisa de `ENABLE_RECORDING=1` para mostrar o botão).
3. **Na API:** `RECORDER_SECRET=<segredo longo>` e storage:
   - volume: montar em `/data` e `RECORDINGS_DIR=/data/recordings`,
     `PUBLIC_URL=https://<api>` (links de download passam pela API); ou
   - bucket: `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
     `S3_SECRET_ACCESS_KEY` (links pré-assinados direto do bucket).
4. **Na VPS:**
   ```bash
   sudo modprobe snd-aloop && echo snd-aloop | sudo tee -a /etc/modules
   cd infra/jibri && cp .env.example .env   # preencher
   docker compose up -d --build
   docker logs -f jibri                      # esperar "Joined MUC jibribrewery"
   ```
5. Cron do reenvio:
   `*/15 * * * * docker exec jibri /opt/meet-ayio/retry-pending.sh`

## A validar no deploy

- Nomes exatos das variáveis do Jibri na imagem `stable-11248`
  (`XMPP_PORT` em especial) — conferir em `docker-jitsi-meet/jibri.yml` da
  mesma versão antes de subir.
- Se a imagem atual ainda exige `snd-aloop` no host (versões recentes
  mudaram o áudio; se não exigir, remover `devices` do compose).
- Expor o 5222 do prosody publicamente: usar senhas fortes e, se possível,
  restringir por IP da VPS.

## Aviso de gravação (LGPD)

O Jitsi avisa os participantes quando a gravação começa, mas o aviso formal
(finalidade, base legal, retenção) é do cliente — ver
`plano-video-gravacao-ata-lgpd-14-10.md` no SeuCartório.
