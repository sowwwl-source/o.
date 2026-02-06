.PHONY: help dev up down logs build clean test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start development environment
	docker compose up -d
	@echo ""
	@echo "Services started:"
	@echo "  API:      http://localhost:8000"
	@echo "  Database: localhost:3306"
	@echo ""
	@echo "Test health: curl http://localhost:8000/health"

up: dev ## Alias for dev

down: ## Stop all services
	docker compose down

logs: ## View logs (use SERVICE=api or SERVICE=db for specific service)
	@if [ -z "$(SERVICE)" ]; then \
		docker compose logs -f; \
	else \
		docker compose logs -f $(SERVICE); \
	fi

build: ## Build API Docker image
	cd sowwwl-api-php && docker build -t sowwwl-api:latest .

clean: ## Stop and remove all containers, volumes, and images
	docker compose down -v
	docker rmi sowwwl-api:latest 2>/dev/null || true

test: ## Run quick API tests
	@echo "Testing health endpoint..."
	@curl -s http://localhost:8000/health | jq .
	@echo ""
	@echo "Testing register endpoint..."
	@curl -s -X POST http://localhost:8000/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"test@example.com","password":"test12345"}' | jq .

init-db: ## Initialize database with schema
	docker compose exec db mysql -u sowwwl -psowwwlpass sowwwl < sowwwl-api-php/schema.sql
	@echo "Database initialized successfully"
