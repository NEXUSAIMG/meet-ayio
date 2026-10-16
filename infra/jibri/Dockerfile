FROM jitsi/jibri:stable-11248

# Script de finalização do Meet Ayio: envia cada gravação para a meet-ayio-api.
# curl para o upload; ffprobe (ffmpeg) já vem na imagem do Jibri.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY finalize.sh retry-pending.sh /opt/meet-ayio/
RUN chmod +x /opt/meet-ayio/*.sh
ENV JIBRI_FINALIZE_RECORDING_SCRIPT_PATH=/opt/meet-ayio/finalize.sh
