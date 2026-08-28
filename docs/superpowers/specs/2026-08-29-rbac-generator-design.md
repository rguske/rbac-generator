# rbac-generator — Design Spec

**Date:** 2026-08-29
**Status:** Approved

## 1. Overview & Goals

`rbac-generator` is a self-contained web application that helps users easily create Kubernetes/OpenShift `Role`, `ClusterRole`, `RoleBinding`, and `ClusterRoleBinding` resources through a guided UI, instead of hand-writing YAML.

Goals:

- Provide a PatternFly 6 UI for building the four RBAC kinds via a structured form, with a live YAML view kept in sync.
- Optionally connect to a live cluster (via a user-supplied kubeconfig) to:
  - Populate available apiGroups/resources/verbs from live API discovery.
  - Validate resources with a server-side dry-run before applying.
  - Apply resources directly to the cluster.
  - Browse (read-only) existing Roles/ClusterRoles/RoleBindings/ClusterRoleBindings.
- Work purely as a YAML generator (download/copy) even without a cluster connection, using a built-in static fallback list of apiGroups/resources/verbs.
- Ship as a single container image, built from Red Hat UBI9 images at every build stage.
- Protect access with a simple built-in login (PatternFly6 `LoginPage`), since this is an internal/trusted-network tool with no external identity provider dependency.

Non-goals (v1):

- Editing or deleting existing RBAC resources (Browse is read-only).
- Multi-user accounts, RBAC-for-the-tool-itself, or audit logging.
- Persisting cluster connections or kubeconfigs across sessions/restarts.
- OIDC/SSO integration (may be revisited later).

## 2. Architecture

Single container running one Go binary that:

- Serves the built React + PatternFly 6 frontend as embedded static assets (`go:embed`).
- Exposes a JSON REST API under `/api/*`.
- Holds all session state in memory (no database).

```
┌───────────────────────────────────────────────────────────┐
│                  Container (Go binary)                     │
│                                                             │
│  PF6 LoginPage ──POST /api/login──► Auth middleware        │
│                                      (env APP_USERNAME +    │
│                                       bcrypt APP_PASSWORD_  │
│                                       HASH)                 │
│                                           │ sets session    │
│                                           ▼ cookie          │
│                              in-memory session store        │
│                              sessionID → { authed: bool,    │
│                                            clientset: *Clientset }
│                                           │                 │
│  All other routes (/api/*, static) ◄──────┘ require authed  │
└───────────────────────────────┬─────────────────────────────┘
                                │ kubeconfig-authenticated
                                ▼
                    Target Kubernetes/OpenShift cluster
```

### 2.1 Authentication (app-level)

- A PatternFly6 `LoginPage` is shown whenever the session is unauthenticated.
- Credentials: a single shared username/password, configured via container env vars `APP_USERNAME` and `APP_PASSWORD_HASH` (bcrypt hash), ideally sourced from a Kubernetes `Secret` in the deployment manifests.
- `POST /api/login {username, password}` validates against the env-configured credentials and, on success, sets an httpOnly, secure, `SameSite=Strict` session cookie.
- All routes except `/api/login`, `/healthz`, `/readyz`, and login-page static assets require a valid authenticated session (401 otherwise; frontend redirects to the Login page).
- `POST /api/logout` clears the session.

### 2.2 Cluster connection (per session)

- One session cookie/session entry serves both concerns: app-level auth (`authed: bool`) and cluster connection (`clientset: *kubernetes.Clientset`, initially nil).
- `POST /api/connection {kubeconfig}` — user pastes or uploads kubeconfig text. Backend parses it, builds a `*kubernetes.Clientset`, and sanity-checks it with `Discovery().ServerVersion()`. On success, the clientset is stored in the session; the raw kubeconfig text is discarded immediately (never written to disk, never logged).
- `DELETE /api/connection` — disconnects (clears the clientset), keeps the user logged in to the app.
- `GET /api/session` — returns `{ authenticated, connected, clusterInfo? }` for the frontend to render the right state on load/refresh.
- Sessions (and their clientsets) expire after an idle TTL (e.g. 30 minutes) via a background janitor goroutine; kubeconfigs are never persisted to disk or any external store.

## 3. UI Structure (PatternFly 6)

Sidebar navigation (shown once authenticated):

1. **Connection** — paste/upload kubeconfig; shows current status (server URL, cluster version, current context) with a **Disconnect** button.
2. **Create** — kind selector (Role / ClusterRole / RoleBinding / ClusterRoleBinding):
   - Metadata fields (name, namespace when applicable).
   - Rule builder (Role/ClusterRole): repeatable rows of apiGroups, resources, verbs, optional resourceNames — populated from live discovery when connected, or a static built-in list otherwise.
   - Subject builder (RoleBinding/ClusterRoleBinding): dropdown of ServiceAccounts fetched per-namespace from the cluster (when connected) plus free-text entry for Users/Groups; `roleRef` selection.
   - **Form ⇄ YAML toggle**: a single canonical in-memory object model drives both the form and a `@patternfly/react-code-editor` (Monaco) YAML view via `js-yaml`. Editing the YAML directly re-parses back into the model on toggle/blur, with inline validation against the expected `Kind` schema (invalid YAML blocks switching back to form view until fixed).
   - **Preview & Dry-Run**: shows the final YAML plus a server-side dry-run result (`DryRun: ["All"]`) in a modal. Disabled (with a tooltip) when not connected.
   - **Apply**: enabled only after a passing dry-run; performs the actual create call.
   - **Download YAML / Copy to clipboard**: always available, regardless of connection state.
3. **Browse** — read-only list per kind (PatternFly `Table`), with a namespace filter for namespaced kinds and a name search. Row click opens a drawer showing the full resource YAML (read-only).

## 4. API Design

All endpoints are JSON over HTTPS/HTTP, cookie-session authenticated (except where noted). `{kind}` is one of `roles | clusterroles | rolebindings | clusterrolebindings`.

```
POST   /api/login                              (no auth required)
POST   /api/logout
GET    /api/session                            -> { authenticated, connected, clusterInfo? }

POST   /api/connection                         -> connect via kubeconfig; returns { server, version, currentContext }
DELETE /api/connection                         -> disconnect (session stays authenticated)

GET    /api/discovery/resources                -> live (if connected) or static apiGroups/resources/verbs
GET    /api/namespaces                         -> requires connection
GET    /api/namespaces/{ns}/serviceaccounts    -> requires connection

POST   /api/rbac/{kind}/dry-run                -> requires connection; server-side dry-run
POST   /api/rbac/{kind}                        -> requires connection; actual create
GET    /api/rbac/{kind}?namespace=x            -> list (namespace ignored/omitted for cluster-scoped kinds); requires connection
GET    /api/rbac/{kind}/{namespace}/{name}     -> get one (namespace segment omitted for cluster-scoped kinds); requires connection

GET    /healthz                                (no auth required, liveness)
GET    /readyz                                 (no auth required, readiness)
```

## 5. Tech Stack

- **Backend**: Go 1.22+, `chi` router, `client-go` + `apimachinery` (dry-run support), `golang.org/x/crypto/bcrypt`, in-memory session store (`map[string]*Session` guarded by a mutex, with a TTL janitor goroutine).
- **Frontend**: React 18 + TypeScript + Vite, `@patternfly/react-core` v6, `@patternfly/react-table` v6, `@patternfly/react-code-editor` v6, `js-yaml`, `react-router`.

## 6. Project Structure

```
rbac-generator/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── auth/        # login handler, session middleware, bcrypt check
│   │   ├── session/     # in-memory store, TTL cleanup
│   │   ├── k8sclient/   # kubeconfig -> clientset builder
│   │   ├── rbac/        # handlers for the 4 kinds: create, dry-run, list, get
│   │   ├── discovery/   # live cluster discovery + static fallback list
│   │   └── httpapi/     # router wiring, embeds frontend/dist via go:embed
│   ├── go.mod / go.sum
│   └── *_test.go        # alongside each package
├── frontend/
│   ├── src/
│   │   ├── pages/        # Login, Connection, Create, Browse
│   │   ├── components/   # RuleBuilder, SubjectBuilder, YamlToggle, ResourceTable, YamlDrawer
│   │   ├── api/          # typed fetch client
│   │   └── types/        # TS types for the 4 kinds
│   ├── package.json
│   └── vite.config.ts
├── deploy/kustomize/base/
│   ├── deployment.yaml   # readiness/liveness on /healthz & /readyz, env from Secret
│   ├── service.yaml
│   ├── route.yaml        # OpenShift Route (Ingress noted as alternative in README)
│   ├── secret.example.yaml
│   └── kustomization.yaml
├── Containerfile          # multi-stage, all Red Hat UBI9 images
├── Makefile                # build, test, run, image
└── README.md
```

## 7. Container Build

Multi-stage `Containerfile`, using Red Hat UBI9 images for every stage:

```dockerfile
# Stage 1: frontend build
FROM registry.access.redhat.com/ubi9/nodejs-22 AS frontend-build
...

# Stage 2: Go build (CGO_ENABLED=0 for a static binary)
FROM registry.access.redhat.com/ubi9/go-toolset AS backend-build
...

# Stage 3: minimal runtime — just the static binary, no shell/package manager
FROM registry.access.redhat.com/ubi9/ubi-micro
COPY --from=backend-build /opt/app-root/src/rbac-generator /usr/bin/rbac-generator
ENTRYPOINT ["/usr/bin/rbac-generator"]
```

- `ubi9/nodejs-22` and `ubi9/go-toolset` are Red Hat's official UBI9 build images, pullable unauthenticated from `registry.access.redhat.com`.
- `ubi9/ubi-micro` is Red Hat's smallest UBI runtime variant, appropriate since the final artifact is a single static Go binary. This minimizes attack surface for a tool that handles kubeconfigs/credentials in memory.
- README documents swapping to authenticated `registry.redhat.io` equivalents as a one-line change if required by an enterprise registry mirror policy.

## 8. Deployment Manifests

Basic kustomize base under `deploy/kustomize/base/`:

- `deployment.yaml` — 1 replica, resource requests/limits, env vars (`APP_USERNAME`, `APP_PASSWORD_HASH`) sourced from a `Secret`, `livenessProbe`/`readinessProbe` on `/healthz` and `/readyz`.
- `service.yaml` — `ClusterIP`, port 8080.
- `route.yaml` — OpenShift `Route` (TLS edge-terminated); README notes a plain K8s `Ingress` as the vanilla-Kubernetes alternative.
- `secret.example.yaml` — template only, no real credentials committed.
- `kustomization.yaml` — ties the base together.

The application itself needs no in-cluster ServiceAccount permissions beyond the default — it never talks to the Kubernetes API of the cluster it runs in; it only talks to whatever target cluster the user's kubeconfig points to.

## 9. Security Considerations

- Kubeconfig text is held only in memory for the duration of the session; never written to disk, never logged, discarded on disconnect/session expiry.
- App login credentials are bcrypt-hashed and supplied via env vars/Secret, never hardcoded.
- Session cookies are httpOnly, secure, `SameSite=Strict`.
- No sensitive values (kubeconfig contents, passwords, tokens) are ever written to logs (`slog`, stdout only).
- This tool assumes a trusted network / internal deployment; it is not intended to be exposed directly to the public internet without an additional reverse-proxy/auth layer.

## 10. Testing Strategy

- **Backend**: Go unit tests using `k8s.io/client-go/kubernetes/fake` for the RBAC handlers (create/dry-run/list without a real cluster), plus tests for object builders, YAML round-trip logic, session TTL/cleanup, and auth middleware.
- **Frontend**: Vitest + React Testing Library for RuleBuilder/SubjectBuilder logic and Form⇄YAML sync behavior.
- `make test` runs both suites.

## 11. Health & Observability

- `/healthz` (liveness) and `/readyz` (readiness) — unauthenticated, no external dependencies to check (in-memory only), always return 200 once the server is up.
- Structured logging via `slog` to stdout.

## 12. Decision Log

| Decision | Choice |
|---|---|
| Apply target | Both: generate YAML and optionally apply directly to a connected cluster |
| Cluster connectivity | Kubeconfig paste/upload per session (no in-cluster ServiceAccount mode) |
| Feature scope | Create + read-only List/Browse (no edit/delete in v1) |
| Rule builder UX | Structured form with a synced Form ⇄ YAML toggle |
| Backend stack | Go + client-go |
| Subjects UX | Cluster lookup (ServiceAccounts) + manual entry (Users/Groups) |
| App auth | PatternFly6 Login page, backend session cookie, env-based credentials (bcrypt) |
| Kubeconfig handling | Paste or upload, in-memory session-only, never persisted |
| Container packaging | Single container, Go backend embeds built frontend |
| Offline mode | Static fallback list of apiGroups/resources/verbs when not connected |
| Apply safety | YAML preview + server-side dry-run + explicit Apply confirmation |
| UI navigation | PatternFly sidebar Nav: Connection / Create / Browse |
| Deployment manifests | Kustomize base: Deployment, Service, Route, Secret example |
| Base images | Red Hat UBI9 images for every build stage (nodejs-22, go-toolset, ubi-micro) |
| Project name | rbac-generator |
