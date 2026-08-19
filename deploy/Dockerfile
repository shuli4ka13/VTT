FROM node:24.18.0-alpine AS build
WORKDIR /app

COPY package.json yarn.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/web ./apps/web
COPY samples ./samples

RUN yarn install --frozen-lockfile
RUN yarn --cwd apps/web build

FROM node:24.18.0-alpine
WORKDIR /app
COPY --from=build /app ./

ENV VTT_PORT=8100 \
    VTT_DB=/data/vtt.db \
    VTT_STATIC=/app/apps/web/dist

RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s \
  CMD node -e "fetch('http://localhost:8100/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["yarn", "--cwd", "apps/server", "start"]
