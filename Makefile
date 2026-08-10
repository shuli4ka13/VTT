# Один вход во все режимы проекта. `make` без цели — шпаргалка.
#
# Порт контейнера: 8100 (карта соседей OrbStack: cdm — 80, melgis — 8080/8081/5435,
# 8000 оставлен оффлайн-режиму). Переопределение: VTT_PORT=9000 make up

VTT_PORT ?= 8100
export VTT_PORT

.PHONY: help up down reset rebuild seed logs status test dev offline url \
        install ts ts-server ts-web ts-test ts-check ts-seed

help:
	@echo "Стенд в контейнере (OrbStack):"
	@echo "  make up       — собрать и поднять → http://localhost:$(VTT_PORT)"
	@echo "  make down     — остановить (данные живы в томе vtt_data)"
	@echo "  make reset    — остановить и СТЕРЕТЬ базу (полный сброс стенда)"
	@echo "  make rebuild  — пересобрать после правок кода и перезапустить"
	@echo "  make seed     — положить в стенд готовые миры-образцы (5e и киберпанк)"
	@echo "  make logs     — журнал сервера вживую"
	@echo "  make status   — состояние контейнера и занятые соседями порты"
	@echo ""
	@echo "Без докера:"
	@echo "  make dev      — стендовый сервер локальной нодой на :8000"
	@echo "  make offline  — оффлайн-режим без сервера (python) на :8000"
	@echo "  make test     — все 505 тестов PoC в терминале"
	@echo ""
	@echo "Новый стек (TypeScript, монорепо):"
	@echo "  make install   — поставить зависимости (pnpm)"
	@echo "  make ts        — сервер :8200 и веб :8300 разом"
	@echo "  make ts-server — только сервер (NestJS + вебсокет)"
	@echo "  make ts-web    — только веб (React + Vite)"
	@echo "  make ts-seed   — положить на сервер миры-образцы (5e и киберпанк)"
	@echo "  make ts-test   — тесты всех пакетов"
	@echo "  make ts-check  — проверка типов"

up:
	docker compose up -d --build
	@echo "→ http://localhost:$(VTT_PORT)"

down:
	docker compose down

reset:
	docker compose down -v
	@echo "том vtt_data стёрт: миры, комнаты и журналы — с чистого листа"

rebuild: up

seed:
	VTT_URL=http://localhost:$(VTT_PORT) node server/seed.js

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


# ── новый стек: монорепо на TypeScript ──────────────────────────────────────
# PoC выше остаётся нетронутым эталоном; здесь живёт продуктовый каркас.

install:
	pnpm install

ts-server:
	cd apps/server && pnpm dev

ts-web:
	cd apps/web && pnpm dev

# Сервер в фоне, веб на переднем плане: Ctrl-C гасит оба.
ts:
	@echo "сервер :8200 · веб :8300"
	@(cd apps/server && pnpm dev &) ; cd apps/web && pnpm dev

# Образцы публикуются готовыми мирами — конструктор при этом стартует пустым.
ts-seed:
	cd apps/server && pnpm seed

ts-test:
	pnpm -r --if-present test

ts-check:
	pnpm -r --if-present typecheck
