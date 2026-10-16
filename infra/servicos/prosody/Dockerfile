# Meet Ayio - prosody (XMPP + autenticacao JWT)
#
# Sem volume de proposito: na stable-11248 o prosody recria a cada boot os
# usuarios internos (focus, jvb, jibri, recorder) a partir das senhas nas
# variaveis, e gera certificados auto-assinados novos. Com JWT nao existe
# conta de usuario final para guardar. Sem volume, /var/lib/prosody continua
# do usuario s6 da imagem e nao ha problema de permissao no Railway.
FROM ghcr.io/jitsi/prosody:stable-11248

# Valores fixos do produto. Segredos e enderecos ficam nas variaveis do
# Railway (ver infra/README.md); qualquer um destes pode ser sobrescrito la.
ENV XMPP_DOMAIN=meet.jitsi \
    XMPP_AUTH_DOMAIN=auth.meet.jitsi \
    XMPP_MUC_DOMAIN=muc.meet.jitsi \
    XMPP_INTERNAL_MUC_DOMAIN=internal-muc.meet.jitsi \
    XMPP_HIDDEN_DOMAIN=hidden.meet.jitsi \
    ENABLE_AUTH=1 \
    AUTH_TYPE=jwt \
    ENABLE_GUESTS=0 \
    JWT_APP_ID=meet-ayio \
    JWT_ACCEPTED_ISSUERS=meet-ayio \
    JWT_ACCEPTED_AUDIENCES=meet-ayio \
    XMPP_MUC_MODULES=token_affiliation \
    WAIT_FOR_HOST_DISABLE_AUTO_OWNERS=1 \
    TURN_TRANSPORT=tcp \
    TZ=America/Sao_Paulo
