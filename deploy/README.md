# Полигон на cdm: как выкатить

Один контейнер (Nest: статика + API + сокет) + том под sqlite. Чужой стек
на машине (`/opt/cdm`, critscroll.com) не трогается вообще: своя папка
`/opt/vtt`, свои имена, свой порт, жёсткий лимит памяти 300 MB.

## Что попросить у владельца машины (или сделать в консоли AWS)

Открыть входящий TCP-порт **8100** в security group инстанса
`<EC2>` (ip-172-31-41-206, Франкфурт). Одно правило:
`Custom TCP · 8100 · 0.0.0.0/0`. Больше ничего: 80/443 и стек CDM
не затрагиваются, наружу торчит только наш порт, и он за паролем.

Пока порт не открыт, можно жить туннелем:
`ssh -L 8100:localhost:8100 cdm` и в compose поставить `VTT_BIND=127.0.0.1`.

## Выкатка (с локальной машины)

```bash
# 1. Собрать образ под x86_64 (мак — arm, машина — amd64):
docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t vtt-poligon:latest .

# 2. Перевезти образ по ssh (реестра нет, и не надо):
docker save vtt-poligon:latest | gzip | ssh cdm 'gunzip | docker load'

# 3. Разложить и запустить (первый раз):
ssh cdm 'mkdir -p /opt/vtt' 2>/dev/null || ssh cdm 'sudo mkdir -p /opt/vtt && sudo chown ubuntu /opt/vtt'
scp deploy/compose.yaml cdm:/opt/vtt/compose.yaml
ssh cdm 'cd /opt/vtt && echo "VTT_AUTH=мастер:ПРИДУМАТЬ_ПАРОЛЬ" > .env && docker compose up -d'

# 4. Посадить образцовые миры (один раз, изнутри машины):
ssh cdm 'docker exec -e VTT_URL=http://localhost:8100 -e VTT_AUTH="$(grep VTT_AUTH /opt/vtt/.env | cut -d= -f2-)" vtt-poligon pnpm --dir apps/server seed'
```

Обновление версии: повторить шаги 1–2 и `ssh cdm 'cd /opt/vtt && docker compose up -d'`.
База в томе `vtt_vtt_data` — пересборки её не трогают.

## Проверка

```bash
curl -si http://<EC2>:8100/ | head -3          # 401 — калитка стоит
curl -si -u мастер:пароль http://<EC2>:8100/ | head -3   # 200 — пустили
```

Мастерам выдаётся: `http://<EC2>:8100` + логин/пароль. Внутри — свой
вход по имени, как на локальном стенде.
