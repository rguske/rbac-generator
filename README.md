# rbac-generator

A small tool for building Kubernetes/OpenShift `Role`, `ClusterRole`,
`RoleBinding`, and `ClusterRoleBinding` resources through a guided PatternFly 6 UI,
instead of hand-writing YAML. Optionally connects to a live cluster (via a
pasted/uploaded kubeconfig, held only in memory for the session) to validate with
a server-side dry-run, apply resources directly, and browse existing ones read-only.

## Features

- Guided form builder for all four RBAC kinds, with a live Form ⇄ YAML toggle.
- Works offline as a pure YAML generator (download/copy) with a built-in static
  catalog of common apiGroups/resources/verbs.
- When connected to a cluster: live API discovery, ServiceAccount lookup,
  server-side dry-run validation, and direct apply.
- Read-only Browse view for existing Roles/ClusterRoles/RoleBindings/ClusterRoleBindings.
- Simple built-in login (PatternFly6 `LoginPage`) backed by a single shared,
  env-configured, bcrypt-hashed credential.
- Ships as a single container image, built entirely from Red Hat UBI9 images.

## Local development

```bash
# Backend
cd backend && go run ./cmd/server   # requires APP_USERNAME / APP_PASSWORD_HASH env vars

# Frontend (separate terminal)
cd frontend && npm run dev
```

Generate a password hash for local use:
```bash
make hash-password PASSWORD=yourpassword
```

## Running the tests

```bash
make test          # backend (Go)
cd frontend && npm test   # frontend (Vitest)
```

## Building the container image

```bash
make image
```

This builds `rbac-generator:latest` using a multi-stage `Containerfile` where
every stage is a Red Hat UBI9 image:

- `registry.access.redhat.com/ubi9/nodejs-22` — builds the frontend.
- `registry.access.redhat.com/ubi9/go-toolset:1.25` — builds the Go backend and
  embeds the frontend build output via `go:embed`. Pinned to the `1.25` tag so the
  toolchain always matches `backend/go.mod`'s `go 1.25.0` directive (the untagged
  `:latest` image can ship a newer/older Go release).
- `registry.access.redhat.com/ubi9/ubi-micro` — final runtime, containing only the
  compiled static binary (no shell, no package manager).

To use an enterprise/authenticated mirror instead of the free `registry.access.redhat.com`
images, swap each `FROM` line to the equivalent `registry.redhat.io/ubi9/...` image
(requires `podman login registry.redhat.io` first).

## Running the container

```bash
podman run --rm -p 8080:8080 \
  -e APP_USERNAME=admin \
  -e APP_PASSWORD_HASH="$(make hash-password PASSWORD=yourpassword)" \
  rbac-generator:latest
```

Then open http://localhost:8080 and log in.

## Deploying to OpenShift/Kubernetes

Base manifests live under `deploy/kustomize/base/` (Deployment, Service, Route).
On vanilla Kubernetes (no Route CRD), remove `route.yaml` from
`kustomization.yaml` and add your own `Ingress` instead.

1. Copy `deploy/kustomize/base/secret.example.yaml` to
   `deploy/kustomize/base/secret.yaml` (already gitignored) and fill in real
   values (`APP_PASSWORD_HASH` from `make hash-password`).
2. Apply the secret: `kubectl apply -f deploy/kustomize/base/secret.yaml`
3. Apply the base: `kubectl apply -k deploy/kustomize/base`

## Security notes

- Kubeconfig text is held only in memory for the duration of a session and is
  never written to disk or logged.
- This tool assumes a trusted network / internal deployment. It is not intended
  to be exposed directly to the public internet without an additional
  reverse-proxy/auth layer.
- v1 does not support editing or deleting existing RBAC resources — Browse is
  read-only.

## Design & implementation history

- Design spec: `docs/superpowers/specs/2026-08-29-rbac-generator-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-29-rbac-generator.md`
