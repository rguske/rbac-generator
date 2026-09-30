# Containerfile

# Stage 1 (only) is pinned to --platform=$BUILDPLATFORM, i.e. it always
# builds using the architecture actually running `podman build`, not the
# target platform(s) passed via `--platform`. Its output (plain JS/HTML/CSS)
# is identical regardless of the final image's architecture, so there is no
# reason to build it once per target platform at all.
#
# This matters in practice: without it, building linux/amd64 on an Apple
# Silicon (arm64) host runs `npm run build` (tsc + vite/esbuild) under QEMU
# user-mode emulation, and Node's V8 JIT reliably crashes there with
# "qemu: uncaught target signal 11 (Segmentation fault)". Pinning to
# BUILDPLATFORM avoids emulating that step entirely.
#
# Note: the Go backend stage below is deliberately left UNPINNED (i.e. it
# still builds once per --platform target, under QEMU emulation for
# linux/amd64 on this host). That's intentional, not an oversight — the
# obvious "fix" of cross-compiling via `GOOS=$TARGETOS GOARCH=$TARGETARCH`
# in a BUILDPLATFORM-pinned stage does NOT work reliably here: this
# Podman/Buildah version does not resolve TARGETARCH/TARGETPLATFORM
# correctly per target job in multi-platform `podman build --platform a,b`
# builds (verified: it returns the build host's own arch for every target,
# with or without stage pinning). Letting `go build` run unpinned, so its
# GOARCH implicitly matches whatever architecture the container is actually
# executing as (natively or under emulation), sidesteps that bug entirely —
# and plain, CGO-free Go compilation isn't prone to the JIT-related crashes
# that make Node's build tools unstable under QEMU.

# Stage 1: build the frontend
FROM --platform=$BUILDPLATFORM registry.access.redhat.com/ubi9/nodejs-22 AS frontend-build
USER 0
WORKDIR /opt/app-root/src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the Go backend, embedding the frontend build output
FROM registry.access.redhat.com/ubi9/go-toolset:1.25 AS backend-build
USER 0
WORKDIR /opt/app-root/src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Matches the //go:embed directive in backend/internal/httpapi/static.go
COPY --from=frontend-build /opt/app-root/src/dist/ ./internal/httpapi/static/dist/
ENV CGO_ENABLED=0
RUN go build -o /opt/app-root/src/bin/rbac-generator ./cmd/server

# Stage 3: minimal runtime — just the static binary
FROM registry.access.redhat.com/ubi9/ubi-micro
COPY --from=backend-build /opt/app-root/src/bin/rbac-generator /usr/bin/rbac-generator
EXPOSE 8080
USER 1001
ENTRYPOINT ["/usr/bin/rbac-generator"]
