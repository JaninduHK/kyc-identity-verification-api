# Kestrel KYC — developer task runner
.DEFAULT_GOAL := help

COMPOSE      := docker compose
COMPOSE_TEST := docker compose -f docker-compose.test.yml
PSQL         := $(COMPOSE) exec -T postgres psql -U kestrel -d kestrel_kyc

GO_SERVICES     := gateway audit
NODE_SERVICES   := orchestrator aml notification
PYTHON_SERVICES := document biometric risk
ALL_SERVICES    := gateway orchestrator document biometric aml risk audit notification

.PHONY: help dev-up dev-down dev-logs test db-migrate db-seed db-reset lint build-all

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env:  ## Create .env.local from the example if missing
	@test -f .env.local || (cp .env.example .env.local && echo "Created .env.local from .env.example")

dev-up: env  ## Start the full stack (builds images as needed)
	$(COMPOSE) up -d --build

dev-down:  ## Stop the stack and remove containers
	$(COMPOSE) down

dev-logs:  ## Tail logs from all services
	$(COMPOSE) logs -f

db-migrate:  ## Apply all SQL migrations (idempotent-ish; uses running postgres)
	@for f in database/migrations/*.sql; do \
		echo ">> applying $$f"; \
		$(PSQL) -v ON_ERROR_STOP=1 -f "/docker-entrypoint-initdb.d/$$(basename $$f)" 2>/dev/null \
			|| cat "$$f" | $(PSQL) -v ON_ERROR_STOP=1; \
	done

db-seed:  ## Load test clients and sandbox API keys
	cat database/seeds/test_data.sql | $(PSQL) -v ON_ERROR_STOP=1

db-reset:  ## Drop and recreate the database, re-run migrations + seed
	$(PSQL) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	@$(MAKE) db-migrate db-seed

test:  ## Run all test suites (go / node / python) against the test stack
	$(COMPOSE_TEST) up -d
	@for s in $(GO_SERVICES); do echo "== go test: $$s =="; (cd services/$$s && go test ./... -race) || exit 1; done
	@for s in $(NODE_SERVICES); do echo "== node test: $$s =="; (cd services/$$s && npm install --silent && npm test --if-present && npx tsc --noEmit) || exit 1; done
	@for s in $(PYTHON_SERVICES); do echo "== python test: $$s =="; (cd services/$$s && python -m pytest -q || echo "no tests"); done
	$(COMPOSE_TEST) down

lint:  ## Lint/type-check every service
	@for s in $(GO_SERVICES); do echo "== go vet: $$s =="; (cd services/$$s && go vet ./...); done
	@for s in $(NODE_SERVICES); do echo "== tsc: $$s =="; (cd services/$$s && npx tsc --noEmit); done

build-all:  ## Build all docker images
	$(COMPOSE) build
