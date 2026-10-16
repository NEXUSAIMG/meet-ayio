FROM ghcr.io/jitsi/prosody:stable-11248

# Railway mounts volumes root-owned (uid 0), while the upstream image ends with
# `USER s6`, so s6-overlay drops privileges before its own fix-attrs chown can run
# (EPERM) and prosody's writable check aborts the boot. Railway containers also
# cannot chmod/chown a root-owned volume as non-root, and prosody refuses to run
# as root ("Danger, Will Robinson"). Strategy:
#   1. boot as root, so s6-overlay's fix-attrs chowns the volume root to s6 (1000)
#   2. a post-render helper (appended to the boot-time config render) chowns
#      /run/prosody + the rendered config tree + data dir to s6, then generates the
#      self-signed certs as s6 (prosodyctl cert generate fails as root)
#   3. run the prosody daemon itself as s6 (upstream refuses root)
USER root
RUN mkdir -p /etc/fix-attrs.d \
 && printf '/var/lib/prosody false s6 s6 0755\n' > /etc/fix-attrs.d/01-prosody-data \
 && printf '#!/command/with-contenv bash\nRUN_DIR="$1"; CFG_DIR="$2"; DATA_DIR="$3"; XMPP_DOMAIN="$4"; XMPP_AUTH_DOMAIN="$5"\nchown s6:s6 "$RUN_DIR" 2>/dev/null || true\nchown -R s6:s6 "$CFG_DIR" "$DATA_DIR" 2>/dev/null || true\nif [ ! -f "$CFG_DIR/certs/$XMPP_DOMAIN.crt" ]; then /command/s6-setuidgid s6 prosodyctl --config "$CFG_DIR/prosody.cfg.lua" cert generate "$XMPP_DOMAIN" >/dev/null 2>&1 || true; fi\nif [ ! -f "$CFG_DIR/certs/$XMPP_AUTH_DOMAIN.crt" ]; then /command/s6-setuidgid s6 prosodyctl --config "$CFG_DIR/prosody.cfg.lua" cert generate "$XMPP_AUTH_DOMAIN" >/dev/null 2>&1 || true; fi\nmv "$DATA_DIR"/*crt "$DATA_DIR"/*key "$CFG_DIR/certs/" 2>/dev/null || true\nrm -f "$DATA_DIR"/*.cnf 2>/dev/null || true\nchown -R s6:s6 "$CFG_DIR" "$DATA_DIR" 2>/dev/null || true\n' > /etc/s6-overlay/scripts/railway-fixperms.sh \
 && chmod +x /etc/s6-overlay/scripts/railway-fixperms.sh \
 && sed -i 's|^exec prosody|exec /command/s6-setuidgid s6 prosody|' /etc/s6-overlay/scripts/prosody \
 && sed -i 's#prosodyctl --config #/command/s6-setuidgid s6 prosodyctl --config #g' /etc/s6-overlay/scripts/config \
 && sed -i 's#prosodyctl --config #/command/s6-setuidgid s6 prosodyctl --config #g' /etc/s6-overlay/scripts/register-setup \
 && sed -i '$a bash /etc/s6-overlay/scripts/railway-fixperms.sh /run/prosody /run/prosody/config "$PROSODY_DATA_DIR" "$XMPP_DOMAIN" "$XMPP_AUTH_DOMAIN" || true' /etc/s6-overlay/scripts/config
