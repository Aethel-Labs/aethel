FROM node:20-alpine AS builder

ARG SOURCE_COMMIT
ARG VITE_BOT_API_URL
ARG VITE_STATUS_API_KEY
ARG VITE_FRONTEND_URL

ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV NODE_ENV=production
ENV VITE_BOT_API_URL=${VITE_BOT_API_URL}
ENV VITE_STATUS_API_KEY=${VITE_STATUS_API_KEY}
ENV VITE_FRONTEND_URL=${VITE_FRONTEND_URL}

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY src ./src
COPY scripts ./scripts
COPY locales ./locales
COPY migrations ./migrations
COPY tsconfig.json ./
COPY .env* ./

RUN pnpm run build

WORKDIR /app/web

COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY web/src ./src
COPY web/public ./public
COPY web/index.html ./
COPY web/vite.config.ts ./
COPY web/tsconfig.json ./
COPY web/tsconfig.node.json ./
COPY web/tailwind.config.js ./
COPY web/postcss.config.js ./

RUN pnpm run build

FROM node:20-alpine AS production

ARG SOURCE_COMMIT
ARG VITE_BOT_API_URL
ARG VITE_STATUS_API_KEY
ARG VITE_FRONTEND_URL

ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV NODE_ENV=production
ENV VITE_BOT_API_URL=${VITE_BOT_API_URL}
ENV STATUS_API_KEY=${VITE_STATUS_API_KEY}
ENV VITE_STATUS_API_KEY=${STATUS_API_KEY}
ENV VITE_FRONTEND_URL=${VITE_FRONTEND_URL}

RUN addgroup -g 1001 -S nodejs && \
    adduser -S aethel -u 1001

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
COPY .env* ./

RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

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

CMD ["pnpm", "run", "start"]
