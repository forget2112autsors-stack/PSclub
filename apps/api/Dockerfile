# Monorepo ildizidan quriladi:  docker compose up -d --build
#
# Bitta konteyner ham API, ham interfeysni tarqatadi — alohida veb-server
# sozlash kerak emas. Baza Supabase'da, konteyner ichida emas.

FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

COPY packages/domain ./packages/domain
COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN npm run build --workspace @psklub/web
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# --- Ishga tushirish qatlami ---
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/domain ./packages/domain
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && exec node --no-warnings apps/api/src/index.ts"]
