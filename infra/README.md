# infra — stack Jitsi do Meet Ayio (Railway)

Escrito do zero para o Meet Ayio (16/10/2026) sobre as imagens oficiais do
`docker-jitsi-meet` (Apache 2.0), tag `stable-11248`. Não depende mais do
template lNamelessl (que não tinha licença); dele ficou só a ideia, que é
pública: TURN sobre TCP por um TCP proxy do Railway.

## Serviços

| Serviço Railway | Root Directory | RAM | Exposição |
|---|---|---|---|
| `web` | `infra/servicos/web` | 512 MB | domínio público (porta 8000) |
| `prosody` | `infra/servicos/prosody` | 512 MB | rede privada (+ TCP proxy 5222 só se houver Jibri) |
| `jicofo` | `infra/servicos/jicofo` | 512 MB | rede privada |
| `jvb` | `infra/servicos/jvb` | **2 GB** (não reduzir) | rede privada (10000/udp) |
| `coturn` | `infra/servicos/coturn` | 256 MB | **TCP proxy → 3478** |

Os nomes dos serviços importam: as variáveis abaixo se referenciam por eles
(`jvb.railway.internal`, `${{prosody.RAILWAY_PRIVATE_DOMAIN}}` etc.).

**Mídia:** navegador → TURN/TCP (`*.proxy.rlwy.net:<porta>`) → coturn → UDP
pela rede privada → jvb. O Railway não tem UDP público e o jvb só aceita UDP,
então o coturn é o único caminho de mídia, inclusive em chamadas 1:1.

**Nenhum serviço usa volume.** Na `stable-11248` o prosody recria a cada boot
os usuários internos (focus, jvb, jibri, recorder) a partir das senhas, e com
JWT não existe conta de usuário final para guardar. Sem volume também não há o
problema de permissão de volume do Railway (que o template resolvia com `sed`
nos scripts da imagem).

## O que cada Dockerfile fixa

- **prosody:** JWT (`AUTH_TYPE=jwt`, `JWT_APP_ID/ISSUERS/AUDIENCES=meet-ayio`,
  sem convidado sem token), módulo `token_affiliation` (moderador vem do
  token: `context.user.moderator`/`affiliation`), TURN por TCP.
- **jicofo:** `ENABLE_AUTO_OWNER=0` (quem entra primeiro não vira moderador) e
  `JICOFO_ENABLE_AUTH=0` (com ela ligada o jicofo promove todo usuário com
  token a moderador; quem exige o token para entrar é o prosody),
  brewery do jvb e do Jibri, heap 384 MB.
- **jvb:** STUN desligado, candidatos privados ligados, heap 1792 MB.
- **web:** HTTP na 8000 (TLS fica na borda do Railway), interface em
  português, sem página inicial, sem gravação local no navegador, sem
  links para os apps móveis, sem requisições a terceiros (`custom-config.js`).
- **coturn:** Alpine + coturn, `iniciar.sh` monta o `turnserver.conf` das
  variáveis. Só repassa mídia para o jvb (e para ele mesmo, nas chamadas
  1:1); qualquer outro destino é negado, para não virar proxy aberto. Se o
  IP privado do jvb mudar (redeploy do jvb), o coturn percebe em até 1 min
  e reinicia sozinho.

## Variáveis no Railway

Rodar `node scripts/gerar-segredos.js` na raiz do repo. O `.env` da raiz (fora
do git) traz os valores para colar em **Project Settings → Shared Variables**.
Depois, em cada serviço:

**prosody**
```
JWT_APP_SECRET=${{shared.JWT_APP_SECRET}}
JICOFO_AUTH_PASSWORD=${{shared.JICOFO_AUTH_PASSWORD}}
JVB_AUTH_PASSWORD=${{shared.JVB_AUTH_PASSWORD}}
PUBLIC_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
TURN_HOST=${{coturn.RAILWAY_TCP_PROXY_DOMAIN}}
TURN_PORT=${{coturn.RAILWAY_TCP_PROXY_PORT}}
TURN_CREDENTIALS=${{shared.TURN_SECRET}}
# gravação (fase 6):
ENABLE_RECORDING=1
JIBRI_XMPP_PASSWORD=${{shared.JIBRI_XMPP_PASSWORD}}
JIBRI_RECORDER_PASSWORD=${{shared.JIBRI_RECORDER_PASSWORD}}
```

**jicofo**
```
XMPP_SERVER=prosody.railway.internal
JICOFO_AUTH_PASSWORD=${{shared.JICOFO_AUTH_PASSWORD}}
ENABLE_RECORDING=1
```

**jvb**
```
XMPP_SERVER=prosody.railway.internal
JVB_AUTH_PASSWORD=${{shared.JVB_AUTH_PASSWORD}}
```

**web**
```
PORT=8000
PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
XMPP_BOSH_URL_BASE=http://prosody.railway.internal:5280
ENABLE_RECORDING=1
```

**coturn**
```
TURN_SECRET=${{shared.TURN_SECRET}}
JVB_HOST=jvb.railway.internal
```
E em Settings → Networking do coturn: **TCP Proxy → porta 3478**.

**meet-ayio-api** (serviço da pasta `api/`, ver `api/README` e `.env.example`)
```
JWT_APP_SECRET=${{shared.JWT_APP_SECRET}}
JITSI_DOMAIN=${{web.RAILWAY_PUBLIC_DOMAIN}}
ADMIN_TOKEN, RECORDER_SECRET, FILES_SECRET  (do .env da raiz)
DATABASE_URL=${{MySQL.MYSQL_URL}}
```

Com domínio próprio (ex.: `meet.ayio.com.br`), trocar `PUBLIC_URL` do web e
do prosody e o `JITSI_DOMAIN` da API.

## Deploy

1. Criar o projeto no Railway, os 5 serviços apontando para este repo (Root
   Directory da tabela) e o MySQL + o serviço da API.
2. Variáveis acima; TCP proxy do coturn.
3. Conferir nos logs: prosody "Prosody is ready", jicofo e jvb conectados,
   coturn com "destinos permitidos" mostrando o IP do jvb.
4. Teste do caminho de mídia: `TURN_PROXY=<host:porta do proxy> TURN_SECRET=...
   infra/scripts/teste-turn.sh`.
5. Teste real com 3+ pessoas (wifi, 4G, rede do cartório), com tokens da API.

## Problemas comuns

- **Sem áudio/vídeo com 3+ pessoas:** coturn fora do ar ou sem TCP proxy;
  `TURN_HOST/TURN_PORT` do prosody precisam ser referências ao coturn (a porta
  do proxy muda), não valores fixos.
- **jvb reiniciando:** falta de memória; manter 2 GB e `VIDEOBRIDGE_MAX_MEMORY`
  abaixo disso.
- **jicofo/jvb não conectam:** senha diferente entre prosody e jicofo/jvb
  (usar sempre a variável compartilhada).
- **"Você não tem permissão" ao entrar:** token com `aud`/`iss` diferente de
  `meet-ayio`, `sub` diferente de `meet.jitsi` ou segredo diferente do prosody.

## Gravação (Jibri)

Ver `jibri/README.md`: roda numa VPS (precisa de `/dev/shm` de 2 GB) e fala
com o prosody por um TCP proxy na porta 5222.
