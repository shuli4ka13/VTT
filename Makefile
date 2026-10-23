VTT_API_PORT ?= 8200
VTT_WEB_PORT ?= 8300
export VTT_API_PORT VTT_WEB_PORT

.PHONY: help install ts ts-server ts-web ts-build ts-seed ts-test ts-check

help:
	@echo "Монорепо (TypeScript):"
	@echo "  make install   — поставить зависимости (yarn)"
	@echo "  make ts        — сервер :$(VTT_API_PORT) и веб :$(VTT_WEB_PORT) разом"
	@echo "  make ts-server — только сервер (NestJS + вебсокет)"
	@echo "  make ts-web    — только веб (React + Vite)"
	@echo "  make ts-build  — собрать пакеты, сервер и веб в dist/"
	@echo "  make ts-seed   — положить на сервер миры-образцы (5e и киберпанк)"
	@echo "  make ts-test   — тесты всех пакетов"
	@echo "  make ts-check  — проверка типов"
	@echo ""
	@echo "В докер-стеке CDM: ./bin/manage local up из корня монорепо → vtt.localhost"

install:
	yarn install
	git config core.hooksPath .githooks

ts-build:
	yarn build

ts-server:
	cd apps/server && VTT_PORT=$(VTT_API_PORT) yarn dev

ts-web:
	cd apps/web && yarn dev

ts:
	@echo "сервер :$(VTT_API_PORT) · веб :$(VTT_WEB_PORT) · пакеты пересобираются на лету"
	@yarn build:packages
	@(yarn build:watch &) ; (cd apps/server && VTT_PORT=$(VTT_API_PORT) yarn dev &) ; cd apps/web && yarn dev

ts-seed:
	cd apps/server && yarn seed

ts-test:
	yarn workspaces run test

ts-check:
	yarn workspaces run typecheck
