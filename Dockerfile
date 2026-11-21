# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --maxsockets=4

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SESSION_SECRET=secret-de-build-sans-usage-a-l-execution-0123456789
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/prisma-cache,sharing=locked,mode=0777 export XDG_CACHE_HOME=/prisma-cache && for i in 1 2 3 4 5 6; do npx prisma generate && break; if [ "$i" = 6 ]; then exit 1; fi; echo "nouvel essai prisma $i"; sleep 10; done && npm run build

# Outil de migration isole : evite d'embarquer tout node_modules dans l'image finale.
FROM base AS migrate-kit
WORKDIR /opt/migrate
RUN --mount=type=cache,target=/root/.npm npm init -y > /dev/null \
    && npm install --no-audit --no-fund --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 prisma@7.10.1 @prisma/client@7.10.1 dotenv@^18.0.10

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=migrate-kit --chown=node:node /opt/migrate /opt/migrate
COPY --chown=node:node prisma /opt/migrate/prisma
COPY --chown=node:node prisma.config.ts /opt/migrate/prisma.config.ts
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["sh", "-c", "cd /opt/migrate && ./node_modules/.bin/prisma migrate deploy && cd /app && exec node server.js"]