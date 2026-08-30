# Makefile

# Image tag matches the app's release version (see frontend/package.json and
# APP_VERSION in frontend/src/App.tsx). Deliberately never "latest", so a
# running container's version is always explicit and reproducible.
VERSION ?= v1.0

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
	podman build -t rbac-generator:$(VERSION) -f Containerfile .
