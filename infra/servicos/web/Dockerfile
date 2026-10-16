# Meet Ayio - web (nginx + interface do Jitsi)
# O Railway termina o TLS na borda; o container so serve HTTP na 8000.
FROM ghcr.io/jitsi/web:stable-11248

ENV XMPP_DOMAIN=meet.jitsi \
    XMPP_AUTH_DOMAIN=auth.meet.jitsi \
    XMPP_MUC_DOMAIN=muc.meet.jitsi \
    XMPP_HIDDEN_DOMAIN=hidden.meet.jitsi \
    ENABLE_AUTH=1 \
    AUTH_TYPE=jwt \
    ENABLE_GUESTS=0 \
    DISABLE_HTTPS=1 \
    ENABLE_LETSENCRYPT=0 \
    ENABLE_XMPP_WEBSOCKET=1 \
    DEFAULT_LANGUAGE=ptBR \
    DISABLE_DEEP_LINKING=1 \
    ENABLE_WELCOME_PAGE=0 \
    ENABLE_PREJOIN_PAGE=1 \
    DISABLE_LOCAL_RECORDING=1 \
    ENABLE_LIVESTREAMING=0 \
    TZ=America/Sao_Paulo

# Sem token valido, a pessoa cai nesta pagina em vez da tela de login do Jitsi.
COPY custom-config.js /config/custom-config.js
