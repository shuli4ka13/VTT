# Стенд на VPS: выкатка

Один контейнер `vtt-poligon` (Nest: статика + API + сокет) на личном VPS (`ssh vps`, <VPS>),
папка `/opt/vtt` (`compose.yaml`, `.env` с `VTT_AUTH`), база — том `vtt_vtt_data` (`/data/vtt.db`).
Соседние сервисы на машине (bolota и другие) не трогаются: своё имя, свой порт 8100, свой
`DOCKER_CONFIG=/opt/vtt/.docker` для входа в реестр.

## Как выкатывается

Пуш в `cdm` → GitHub Actions (`.github/workflows/deploy.yml`):

1. **Тесты** — schema, engine, server, web (`vitest run`). Упали — дальше не идёт.
2. **Образ** — `deploy/Dockerfile`, linux/amd64, в `ghcr.io/shuli4ka13/vtt:<коммит>`. Сборка многостадийная:
   dev-зависимости и исходники остаются в стадии `builder`; в образ попадают только
   `yarn install --production` (стадия `deps`) и собранные `dist` пакетов, сервера и веба плюс `samples`.
3. **Выкатка** — по ssh скрипт `deploy/remote-deploy.sh`: копия базы (`VACUUM INTO`) в
   `/opt/vtt/backups/vtt.db.pre-deploy-<время>` (хранятся 15 последних), прежний образ помечается
   `vtt-poligon:previous`, новый становится `vtt-poligon:latest`, `docker compose up -d`, ожидание `healthy`.
   Не поднялся — откат на `previous`, выкатка помечается упавшей.

После выкатки засев приводит миры-образцы на стенде (автор «Образцы») к версии из гита: система и книга
перезаписываются и публикуются заново, готовые листы мира — тоже (`node apps/server/dist/seed-run.js`, без
dev-зависимостей). Системы других авторов, в том числе их копии образцов, не трогаются. Вручную — Actions →
«Проверки и выкатка стенда» → Run workflow.

## Секреты репозитория (Settings → Secrets and variables → Actions)

| Имя | Что |
|---|---|
| `VPS_HOST` | `<VPS>` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | закрытый ключ, у которого открытая половина лежит в `~/.ssh/authorized_keys` на VPS (комментарий `vtt-github-actions-deploy`) |
| `VPS_KNOWN_HOSTS` | строка `ssh-keyscan -t ed25519 <VPS>`; отпечаток `SHA256:Km3GubVsRNrruS+sk8b42UQubG5y/j+zw8iro34/5Rw` |

Вход в `ghcr.io` на VPS — одноразовым `GITHUB_TOKEN` каждой выкатки, после выкатки — `docker logout`.

## Откат руками

```bash
ssh vps 'cd /opt/vtt && docker tag vtt-poligon:previous vtt-poligon:latest && docker compose up -d'
# база: docker cp backups/vtt.db.pre-deploy-<время> vtt-poligon:/data/vtt.db && docker restart vtt-poligon
```
