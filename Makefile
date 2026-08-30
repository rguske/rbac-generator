# Makefile

# Image tag matches the app's release version (see frontend/package.json and
# APP_VERSION in frontend/src/App.tsx). Deliberately never "latest", so a
# running container's version is always explicit and reproducible.
VERSION ?= v1.0

# Build for both architectures so the same tag runs correctly whether it
# lands on an amd64 OpenShift/Kubernetes node or an arm64 one (e.g. Apple
# Silicon locally). Without this, `podman build` on an Apple Silicon Mac
# only produces an arm64 image, which fails with "exec format error" when
# run on the (typically amd64) cluster.
PLATFORMS ?= linux/amd64,linux/arm64
REGISTRY ?= quay.io/rguske/rbac-generator

.PHONY: build test run image push hash-password

build:
	cd backend && go build -o bin/rbac-generator ./cmd/server

test:
	cd backend && go test ./...

run: build
	PORT=$${PORT:-8080} APP_USERNAME=$${APP_USERNAME:?set APP_USERNAME} APP_PASSWORD_HASH=$${APP_PASSWORD_HASH:?set APP_PASSWORD_HASH} ./backend/bin/rbac-generator

hash-password:
	@cd backend && go run ./cmd/hashpw "$(PASSWORD)"

image:
	podman build --platform $(PLATFORMS) --manifest rbac-generator:$(VERSION) -f Containerfile .

push: image
	podman manifest push --all rbac-generator:$(VERSION) docker://$(REGISTRY):$(VERSION)
