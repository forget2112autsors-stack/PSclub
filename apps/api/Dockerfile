# Monorepo ildizidan quriladi:  docker compose build
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
RUN npm ci

COPY packages/domain ./packages/domain
COPY apps/api ./apps/api

RUN npx prisma generate --schema apps/api/prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && exec node --no-warnings apps/api/src/index.ts"]
