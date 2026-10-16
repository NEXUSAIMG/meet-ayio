# Meet Ayio - jvb (videobridge / SFU)
#
# No Railway nao ha UDP publico: toda midia chega pelo coturn (TURN/TCP) e
# entra no jvb por UDP na rede privada. Por isso:
# - STUN desligado (o IP publico descoberto nao recebe UDP, so atrasaria o ICE);
# - candidatos privados ligados (e o endereco que o coturn alcanca).
# Heap abaixo do limite de 2 GB do servico (o jvb nao roda bem com menos).
FROM ghcr.io/jitsi/jvb:stable-11248

ENV XMPP_AUTH_DOMAIN=auth.meet.jitsi \
    XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi \
    JVB_BREWERY_MUC=jvbbrewery \
    JVB_PORT=10000 \
    JVB_DISABLE_STUN=1 \
    JVB_ADVERTISE_PRIVATE_CANDIDATES=1 \
    COLIBRI_REST_ENABLED=1 \
    VIDEOBRIDGE_MAX_MEMORY=1792m \
    TZ=America/Sao_Paulo
