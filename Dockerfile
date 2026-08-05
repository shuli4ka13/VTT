# Стендовый сервер целиком: статика двух приложений + API + sqlite.
# Зависимостей нет вовсе, поэтому ни npm install, ни сборки — копируем и запускаем.
# База: node:24-alpine — от 24-й версии нужен встроенный node:sqlite.

FROM node:24.18.0-alpine

WORKDIR /app

# Только то, что нужно рантайму: движок, сервер, страницы. Ни тестов,
# ни референсов, ни доков — образ маленький, поверхность минимальная.
COPY src/ src/
COPY server/ server/
COPY index.html constructor.html vtt.html ./

# База — в томе, не в слое образа: пересборка не съедает миры и журналы.
ENV STAND_DB=/data/stand.db
ENV PORT=8000
RUN mkdir /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
