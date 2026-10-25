#!/bin/sh
set -eu

IMAGE="$1"
NAME=vtt-poligon
HOME_DIR=/opt/vtt
export DOCKER_CONFIG="$HOME_DIR/.docker"

cd "$HOME_DIR"
mkdir -p backups
STAMP=$(date +%Y-%m-%d-%H%M%S)

echo "== образ $IMAGE"
docker pull "$IMAGE"

if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "== копия базы перед выкаткой"
  docker exec "$NAME" sh -c 'rm -f /data/pre-deploy.db'
  docker exec "$NAME" node -e "new (require('node:sqlite').DatabaseSync)('/data/vtt.db').exec(\"VACUUM INTO '/data/pre-deploy.db'\")"
  docker cp "$NAME:/data/pre-deploy.db" "backups/vtt.db.pre-deploy-$STAMP"
  docker exec "$NAME" rm -f /data/pre-deploy.db
  docker tag "$(docker inspect --format '{{.Image}}' "$NAME")" "$NAME:previous"
fi

docker tag "$IMAGE" "$NAME:latest"
docker compose up -d

echo "== жду, пока сервер ответит"
STATE=starting
for _ in $(seq 1 60); do
  STATE=$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo missing)
  [ "$STATE" = healthy ] && break
  sleep 3
done

if [ "$STATE" != healthy ]; then
  echo "!! сервер не поднялся ($STATE) — откат на прежний образ"
  docker logs --tail 50 "$NAME" || true
  if docker image inspect "$NAME:previous" >/dev/null 2>&1; then
    docker tag "$NAME:previous" "$NAME:latest"
    docker compose up -d
  fi
  exit 1
fi

echo "== образцы: как в гите"
docker exec -e VTT_URL=http://localhost:8100 -e VTT_OWNER=Образцы "$NAME" node apps/server/dist/seed-run.js

ls -1t backups/vtt.db.pre-deploy-* 2>/dev/null | tail -n +16 | xargs -r rm -f
docker image prune -f >/dev/null
echo "== готово: $IMAGE"
