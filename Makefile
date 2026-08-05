# Один вход во все режимы проекта. `make` без цели — шпаргалка.
#
# Порт контейнера: 8100 (карта соседей OrbStack: cdm — 80, melgis — 8080/8081/5435,
# 8000 оставлен оффлайн-режиму). Переопределение: VTT_PORT=9000 make up

VTT_PORT ?= 8100
export VTT_PORT

.PHONY: help up down reset rebuild logs status test dev offline url

help:
	@echo "Стенд в контейнере (OrbStack):"
	@echo "  make up       — собрать и поднять → http://localhost:$(VTT_PORT)"
	@echo "  make down     — остановить (данные живы в томе vtt_data)"
	@echo "  make reset    — остановить и СТЕРЕТЬ базу (полный сброс стенда)"
	@echo "  make rebuild  — пересобрать после правок кода и перезапустить"
	@echo "  make logs     — журнал сервера вживую"
	@echo "  make status   — состояние контейнера и занятые соседями порты"
	@echo ""
	@echo "Без докера:"
	@echo "  make dev      — стендовый сервер локальной нодой на :8000"
	@echo "  make offline  — оффлайн-режим без сервера (python) на :8000"
	@echo "  make test     — все 392+ теста в терминале"

up:
	docker compose up -d --build
	@echo "→ http://localhost:$(VTT_PORT)"

down:
	docker compose down

reset:
	docker compose down -v
	@echo "том vtt_data стёрт: миры, комнаты и журналы — с чистого листа"

rebuild: up

logs:
	docker logs -f vtt-stand

status:
	@docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAMES|vtt|cdm|melgis' || true

test:
	node tests/run.js

dev:
	node server/server.js

offline:
	python3 -m http.server
