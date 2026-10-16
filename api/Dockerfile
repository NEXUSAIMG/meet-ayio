# meet-ayio-api: Node 22 + ffmpeg (extração/corte do áudio para a transcrição).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall roda "prisma generate" (o client nasce para o Linux da imagem)
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
