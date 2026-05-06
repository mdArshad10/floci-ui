.PHONY: up down logs build push dev dev-build dev-down dev-logs dev-api dev-frontend install

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker build -t floci/floci-ui:latest .

push: build
	docker push floci/floci-ui:latest

install:
	cd packages/frontend && npm install
	cd packages/api && ~/.bun/bin/bun install

dev-build:
	docker compose -f docker-compose.dev.yml build

dev:
	docker compose -f docker-compose.dev.yml up

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-api:
	cd packages/api && ~/.bun/bin/bun run --watch src/index.ts

dev-frontend:
	cd packages/frontend && npm run dev
