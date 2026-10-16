FROM ghcr.io/jitsi/jibri:stable-11248

# Script de finalizacao do Meet Ayio: envia cada gravacao para a meet-ayio-api.
# A imagem ja traz curl (base) e ffprobe (o pacote jibri depende do ffmpeg).
# Conferido no docker-jitsi-meet oficial, tag stable-11248 (16/10/2026).
USER root
COPY finalize.sh retry-pending.sh /opt/meet-ayio/
RUN chmod 755 /opt/meet-ayio/*.sh
# A imagem oficial roda como s6 (o Chrome e o jibri nao devem rodar como root).
USER s6
ENV JIBRI_FINALIZE_RECORDING_SCRIPT_PATH=/opt/meet-ayio/finalize.sh
