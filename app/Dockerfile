# meet-ayio-app: Next.js 14 + Prisma (MySQL)
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npm cache clean --force
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000
# Migrações pendentes antes de subir (cria o banco meetayio_app na primeira vez).
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx next start -p ${PORT:-3000}"]
