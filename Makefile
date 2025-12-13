.PHONY: help init dev build test clean format lint

help:
	@echo "relay-mcp development commands:"
	@echo "  make init    - Initialize project (install deps, build packages)"
	@echo "  make dev     - Start relay server + demo (pnpm run dev)"
	@echo "  make build   - Build all packages"
	@echo "  make test    - Run tests"
	@echo "  make format  - Format code with Biome"
	@echo "  make lint    - Lint code with Biome"
	@echo "  make clean   - Clean build artifacts"

init:
	@echo "Installing dependencies..."
	@pnpm install
	@echo "Building all packages..."
	@pnpm run build
	@echo "Initialization complete!"

build:
	@pnpm run build

dev:
	@pnpm run dev

test:
	@pnpm test

format:
	@pnpm run format

lint:
	@pnpm run lint:fix

clean:
	@echo "Cleaning build artifacts..."
	@find packages -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	@rm -rf .relay/capsules/*
	@echo "Clean complete!"
