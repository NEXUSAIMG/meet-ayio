FROM alpine:3.20

# coturn from the Alpine community repo (the upstream coturn/coturn Docker Hub
# base made Metal builds fail silently). Installs turnserver + turnutils.
RUN apk add --no-cache coturn
COPY entrypoint.sh /usr/local/bin/railway-coturn-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-coturn-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/railway-coturn-entrypoint.sh"]
