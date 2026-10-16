# Meet Ayio - jicofo (foco das conferencias)
# Sem volume: a configuracao e gerada das variaveis a cada boot.
FROM ghcr.io/jitsi/jicofo:stable-11248

# Moderador vem do token (token_affiliation no prosody), nao de quem entra
# primeiro. JICOFO_ENABLE_AUTH=0: com a autenticacao do jicofo ligada, ele
# promove TODO usuario autenticado a moderador (visto no teste de 16/10); quem
# exige o token para entrar e o prosody. Heap abaixo do limite de 512 MB.
ENV XMPP_DOMAIN=meet.jitsi \
    XMPP_AUTH_DOMAIN=auth.meet.jitsi \
    XMPP_MUC_DOMAIN=muc.meet.jitsi \
    XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi \
    XMPP_HIDDEN_DOMAIN=hidden.meet.jitsi \
    ENABLE_AUTH=1 \
    AUTH_TYPE=jwt \
    ENABLE_AUTO_OWNER=0 \
    JICOFO_ENABLE_AUTH=0 \
    JVB_BREWERY_MUC=jvbbrewery \
    JIBRI_BREWERY_MUC=jibribrewery \
    JICOFO_ENABLE_HEALTH_CHECKS=1 \
    JICOFO_ENABLE_REST=1 \
    JICOFO_MAX_MEMORY=384m \
    TZ=America/Sao_Paulo
