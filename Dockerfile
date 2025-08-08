FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY src ./src
COPY scripts ./scripts
COPY locales ./locales
COPY migrations ./migrations
COPY tsconfig.json ./

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


RUN addgroup -g 1001 -S nodejs && \
    adduser -S aethel -u 1001

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

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
  CMD node -e "process.exit(0)" || exit 1

CMD ["pnpm", "run", "start"]
