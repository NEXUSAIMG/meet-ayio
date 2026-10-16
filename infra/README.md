# infra — stack Jitsi do Meet Ayio (Railway)

Baseado no template **lNamelessl/jitsi-railway-template** (commit `11ee427`),
copiado para cá para versionarmos as mudanças (JWT, domínio, Jibri).
README original em `UPSTREAM-README.md`.

> ⚠️ O repo upstream não tem arquivo de licença. Antes de abrir este repo ou
> vender o produto, pedir licença ao autor ou reescrever os Dockerfiles.

## Serviços

| Serviço | Origem | RAM | Exposição |
|---|---|---|---|
| web | imagem `ghcr.io/jitsi/web:stable-11248` | 512 MB | domínio público Railway |
| prosody | `docker/prosody/Dockerfile` | 512 MB | rede privada |
| jicofo | `docker/jicofo/Dockerfile` | 512 MB | rede privada |
| jvb | `docker/jvb/Dockerfile` | **2 GB** (não reduzir) | rede privada |
| coturn | `docker/coturn/Dockerfile` | 256 MB | **TCP proxy → 3478** |

Mídia: navegador → TURN/TCP (`*.proxy.rlwy.net`) → coturn → UDP privado → jvb.

## Deploy (fase 2)

1. Fazer o deploy pelo template (`railway.com/deploy/jitsi-meet--jitsi-template`),
   que cria os 5 serviços com todas as variáveis e segredos já ligados.
2. Em cada serviço com Dockerfile (prosody, jicofo, jvb, coturn), trocar a
   origem para **este repo**: Settings → Source → `marciogoes/meet-ayio`,
   Root Directory = `infra/docker/<serviço>`.
3. Criar o moderador (shell do prosody):
   `prosodyctl --config /run/prosody/config/prosody.cfg.lua shell user create admin@auth.meet.jitsi 'SENHA'`
4. Testar com 3+ pessoas (wifi, 4G, rede do cartório).

## Trocar para JWT (depois do teste com auth interna)

Mesmos valores em **prosody, web e jicofo**:

```
ENABLE_AUTH=1
AUTH_TYPE=jwt
JWT_APP_ID=meet-ayio
JWT_APP_SECRET=<segredo longo — o MESMO da meet-ayio-api>
JWT_ACCEPTED_ISSUERS=meet-ayio
JWT_ACCEPTED_AUDIENCES=meet-ayio
ENABLE_GUESTS=0        # 1 = convidado entra sem token (decisão em aberto)
```

O segredo pode ser uma variável compartilhada do projeto no Railway e
referenciada nos três serviços e na API. Conferir depois da troca se o
moderador vindo do token (`context.user.moderator`) é respeitado; se não,
ativar o módulo de afiliação por token no prosody.

## Troubleshooting

Ver a seção Troubleshooting do `UPSTREAM-README.md` (OOM do jvb, senha XMPP
divergente, proxy TCP do coturn ausente).
