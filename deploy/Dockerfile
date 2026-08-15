# Полигон нового стека одним контейнером: Nest отдаёт статику собранного
# фронта, API и сокет стола; база — sqlite в томе. Это НЕ образ старого
# ванильного стенда (корневой Dockerfile) — тот эталон и живёт отдельно.
#
# Сборка фронта происходит здесь же, в build-стадии: на машину полигона
# едет готовый образ (docker save | ssh docker load), собирать на 2 GB
# памяти рядом с чужим продом — не надо.

FROM node:24.18.0-alpine AS build
RUN npm i -g pnpm@11
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/web ./apps/web
# Образцы — данные движка (SAMPLE_WORLDS импортирует json из samples/).
COPY samples ./samples

RUN pnpm install --frozen-lockfile
RUN cd apps/web && pnpm build

# ── рантайм ────────────────────────────────────────────────────────────
# Ставим заново только прод-часть? Нет: сервер запускается tsx-ом из
# исходников (как и в деве), это дев-зависимость — копируем стадию сборки
# целиком. Образ толще, движущихся частей меньше. В продакшне иначе:
# компиляция в js и чистый прод-инсталл.
FROM node:24.18.0-alpine
RUN npm i -g pnpm@11
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

CMD ["pnpm", "--dir", "apps/server", "start"]
