FROM ghcr.io/jitsi/jicofo:stable-11248

# Statics baked as image ENV (Railway template literals would otherwise become
# deploy-form prompts). REST + health endpoints for headless verification; heap
# kept below the 512 MB Railway memory cap.
ENV JICOFO_ENABLE_REST=1 \
    JICOFO_ENABLE_HEALTH_CHECKS=1 \
    JICOFO_MAX_MEMORY=384m
