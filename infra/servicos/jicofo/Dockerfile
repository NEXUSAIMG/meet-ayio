# Meet Ayio - jicofo (foco das conferencias)
# Sem volume: a configuracao e gerada das variaveis a cada boot.
FROM ghcr.io/jitsi/jicofo:stable-11248

# Moderador vem do token (token_affiliation no prosody), nao de quem entra
# primeiro. Heap abaixo do limite de 512 MB do servico.
ENV XMPP_DOMAIN=meet.jitsi \
    XMPP_AUTH_DOMAIN=auth.meet.jitsi \
    XMPP_MUC_DOMAIN=muc.meet.jitsi \
    XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi \
    XMPP_HIDDEN_DOMAIN=hidden.meet.jitsi \
    ENABLE_AUTH=1 \
    AUTH_TYPE=jwt \
    ENABLE_AUTO_OWNER=0 \
    JVB_BREWERY_MUC=jvbbrewery \
    JIBRI_BREWERY_MUC=jibribrewery \
    JICOFO_ENABLE_HEALTH_CHECKS=1 \
    JICOFO_ENABLE_REST=1 \
    JICOFO_MAX_MEMORY=384m \
    TZ=America/Sao_Paulo
