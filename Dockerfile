# BodyMetrics production image. Data (SQLite + photos) lives on a volume mounted at /data.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm install` rather than `npm ci`: a lockfile written on Windows by npm 11 omits a few
# Linux-only optional peers of sharp that npm 10's strict `ci` check rejects.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Ho_Chi_Minh \
    DATABASE_URL=file:/data/bodymetrics.db \
    UPLOAD_DIR=/data/uploads \
    PORT=3000
# Full node_modules: the start script runs the Prisma CLI and the tsx seed.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /data
VOLUME /data
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
