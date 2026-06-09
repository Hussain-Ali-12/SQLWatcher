.PHONY: up down reset backend logs migrate-secureshop build-local verify-backend test-backend

up:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v
	docker compose up --build

backend:
	docker compose build --no-cache backend
	docker compose up backend

logs:
	docker compose logs -f backend sqlwatcher-proxy secureshop-api frontend secureshop-frontend

migrate-secureshop:
	docker compose build client-app
	docker compose run --rm client-app python migrate_cloud_db.py

build-local:
	docker compose build --no-cache backend sqlwatcher-proxy secureshop-api secureshop-frontend frontend

verify-backend:
	curl http://localhost:8000/api/health/live

test-backend:
	docker compose --profile test up --build backend-tests


schema-apply:
	docker compose build client-app
	docker compose run --rm client-app python migrate_cloud_db.py

local-verify-backend:
	docker compose build --no-cache backend
	docker compose up backend
