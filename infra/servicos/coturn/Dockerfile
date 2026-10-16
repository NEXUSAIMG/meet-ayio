# Meet Ayio - coturn (TURN sobre TCP)
#
# E a unica porta de entrada da midia no Railway: navegador -> TCP proxy do
# Railway -> 3478/tcp aqui -> UDP pela rede privada -> jvb:10000.
FROM alpine:3.20

RUN apk add --no-cache coturn bind-tools
COPY iniciar.sh /usr/local/bin/iniciar-coturn
RUN chmod 755 /usr/local/bin/iniciar-coturn

EXPOSE 3478/tcp
USER nobody
ENTRYPOINT ["/usr/local/bin/iniciar-coturn"]
