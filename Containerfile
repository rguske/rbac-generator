# Containerfile

# Stage 1: build the frontend
FROM registry.access.redhat.com/ubi9/nodejs-22 AS frontend-build
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
