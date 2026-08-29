# Makefile
.PHONY: build test run image hash-password

build:
	cd backend && go build -o bin/rbac-generator ./cmd/server

test:
	cd backend && go test ./...

run: build
	PORT=$${PORT:-8080} APP_USERNAME=$${APP_USERNAME:?set APP_USERNAME} APP_PASSWORD_HASH=$${APP_PASSWORD_HASH:?set APP_PASSWORD_HASH} ./backend/bin/rbac-generator

hash-password:
	@cd backend && go run ./cmd/hashpw "$(PASSWORD)"

image:
	podman build -t rbac-generator:latest -f Containerfile .
