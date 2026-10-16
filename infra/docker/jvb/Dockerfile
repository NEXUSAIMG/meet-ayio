FROM ghcr.io/jitsi/jvb:stable-11248

# Statics baked as image ENV (Railway template literals would otherwise become
# deploy-form prompts). Keep the JVM heap below the 2 GB Railway memory cap.
ENV VIDEOBRIDGE_MAX_MEMORY=1792m \
    COLIBRI_REST_ENABLED=1
