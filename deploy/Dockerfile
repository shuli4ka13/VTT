FROM node:24.18.0-alpine AS base
WORKDIR /app


FROM base AS builder

COPY package.json yarn.lock tsconfig.base.json eslint.config.js ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN --mount=type=cache,id=yarn-cache,target=/usr/local/share/.cache/yarn,sharing=locked \
  yarn install \
    --frozen-lockfile \
    --non-interactive

COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/web ./apps/web
COPY samples ./samples

RUN yarn build

FROM base AS deps

COPY package.json yarn.lock tsconfig.base.json ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY apps/server/package.json ./apps/server/package.json

RUN --mount=type=cache,id=yarn-cache,target=/usr/local/share/.cache/yarn,sharing=locked \
  yarn install \
    --frozen-lockfile \
    --non-interactive \
    --production=true

FROM base AS runtime

ENV NODE_ENV=production \
    VTT_PORT=8100 \
    VTT_DB=/data/vtt.db \
    VTT_STATIC=/app/apps/web/dist

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/schema/package.json ./packages/schema/package.json
COPY --from=builder /app/packages/schema/dist ./packages/schema/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/samples ./samples

RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s \
  CMD node -e "fetch('http://localhost:8100/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/main.js"]