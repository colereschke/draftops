.DEFAULT_GOAL := help

# ── Setup ─────────────────────────────────────────────────────────────────────

.PHONY: setup
setup: install db-migrate db-seed ## First-time setup: install deps, run migrations, seed DB
	@echo ""
	@echo "✓ DraftOps is ready. Run 'make dev' to start."

.PHONY: install
install: ## Install dependencies
	pnpm install

# ── Development ───────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start the development server
	pnpm dev

.PHONY: build
build: ## Build for production
	pnpm build

.PHONY: start
start: ## Start the production server (requires build first)
	pnpm start

# ── Code Quality ──────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Run ESLint
	pnpm lint

.PHONY: lint-fix
lint-fix: ## Run ESLint with auto-fix
	pnpm lint:fix

.PHONY: format
format: ## Format all files with Prettier
	pnpm format

.PHONY: format-check
format-check: ## Check formatting without writing
	pnpm format:check

.PHONY: typecheck
typecheck: ## Run TypeScript type-check
	pnpm typecheck

.PHONY: test
test: ## Run tests
	pnpm test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	pnpm test:watch

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	pnpm test:coverage

.PHONY: check
check: typecheck lint format-check test ## Run all checks (typecheck, lint, format, test)

# ── Database ──────────────────────────────────────────────────────────────────

.PHONY: db-migrate
db-migrate: ## Run pending database migrations
	pnpm prisma migrate dev

.PHONY: db-seed
db-seed: ## Seed the database with league teams
	pnpm db:seed

.PHONY: db-reset
db-reset: ## Reset DB and re-run migrations + seed (destructive!)
	pnpm prisma migrate reset --force
	pnpm db:seed

.PHONY: db-studio
db-studio: ## Open Prisma Studio (visual DB browser)
	pnpm prisma studio

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@echo "DraftOps — Dynasty Auction Tool"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
