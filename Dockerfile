FROM oven/bun:latest AS builder

ARG SOURCE_COMMIT
ARG VITE_BOT_API_URL
ARG VITE_STATUS_API_KEY
ARG VITE_FRONTEND_URL
ARG VITE_DISCORD_CLIENT_ID
ARG STATUS_API_KEY

ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV NODE_ENV=production
ENV VITE_BOT_API_URL=${VITE_BOT_API_URL}
ENV VITE_STATUS_API_KEY=${VITE_STATUS_API_KEY}
ENV VITE_FRONTEND_URL=${VITE_FRONTEND_URL}
ENV VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}
ENV STATUS_API_KEY=${STATUS_API_KEY}

WORKDIR /app



COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY scripts ./scripts
COPY locales ./locales
COPY migrations ./migrations
COPY tsconfig.json ./
COPY .env* ./

RUN bun run build

WORKDIR /app/web

COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

COPY web/src ./src
COPY web/public ./public
COPY web/index.html ./
COPY web/vite.config.ts ./
COPY web/tsconfig.json ./
COPY web/tsconfig.node.json ./
COPY web/tailwind.config.js ./
COPY web/postcss.config.js ./

RUN bun run build

FROM oven/bun:1 AS production

ARG SOURCE_COMMIT
ARG VITE_BOT_API_URL
ARG VITE_STATUS_API_KEY
ARG VITE_FRONTEND_URL
ARG VITE_DISCORD_CLIENT_ID

ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV NODE_ENV=production
ENV VITE_BOT_API_URL=${VITE_BOT_API_URL}
ENV STATUS_API_KEY=${STATUS_API_KEY}
ENV VITE_STATUS_API_KEY=${VITE_STATUS_API_KEY}
ENV VITE_FRONTEND_URL=${VITE_FRONTEND_URL}
ENV VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}

RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs aethel

WORKDIR /app



COPY package.json bun.lock ./
COPY .env* ./

RUN bun install --frozen-lockfile --production

COPY --from=builder --chown=aethel:nodejs /app/dist ./dist
COPY --from=builder --chown=aethel:nodejs /app/locales ./locales
COPY --from=builder --chown=aethel:nodejs /app/migrations ./migrations
COPY --from=builder --chown=aethel:nodejs /app/scripts ./scripts
COPY --from=builder --chown=aethel:nodejs /app/web/dist ./web/dist

RUN mkdir -p /app/logs && chown aethel:nodejs /app/logs

USER aethel

EXPOSE 2020

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ps aux | grep node | grep -v grep || exit 1

CMD ["bun", "run", "start"]
