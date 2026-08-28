# rbac-generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `rbac-generator`, a single-container web app (Go backend + PatternFly6/React frontend) that helps users create Kubernetes `Role`, `ClusterRole`, `RoleBinding`, and `ClusterRoleBinding` resources via a guided form with a live YAML view, optionally applying them to a live cluster via a user-supplied kubeconfig.

**Architecture:** A Go backend (`client-go`, `chi` router) holds all state in-memory per session (auth + optional cluster clientset) and serves the built React/PatternFly6 frontend via `go:embed`. The frontend is a single-page app with Login, Connection, Create, and Browse views, talking to the backend over a small REST API.

**Tech Stack:** Go 1.22+, `chi`, `client-go`/`apimachinery`, `golang.org/x/crypto/bcrypt` (backend); React 18 + TypeScript + Vite, `@patternfly/react-core`/`react-table`/`react-code-editor` v6, `js-yaml` (frontend); Vitest + React Testing Library (frontend tests), Go `testing` + `client-go/kubernetes/fake` (backend tests); Red Hat UBI9 images for every container build stage.

## Global Constraints

- Backend: Go 1.22+.
- Frontend: React 18 + TypeScript + Vite; PatternFly 6 only (`@patternfly/react-core`, `@patternfly/react-table`, `@patternfly/react-code-editor`, all pinned to major version 6).
- Single container image; no database; all session state in-memory with TTL.
- Container build uses Red Hat UBI9 images at every stage: `registry.access.redhat.com/ubi9/nodejs-22` (frontend build), `registry.access.redhat.com/ubi9/go-toolset` (backend build), `registry.access.redhat.com/ubi9/ubi-micro` (runtime).
- Kubeconfig text is held only in memory for the session and is never written to disk or logged.
- App login credentials come from env vars `APP_USERNAME` and `APP_PASSWORD_HASH` (bcrypt hash); UI is PatternFly6 `LoginPage`.
- No edit/delete of existing RBAC resources in v1 — Browse is read-only.
- `/healthz` and `/readyz` are unauthenticated.
- Project root: `dev/projects/rbac-generator/` (already git-initialized, spec committed).

---

## Backend

### Task 1: Scaffold the Go backend module and health endpoints

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`
- Create: `backend/cmd/server/main_test.go`
- Create: `Makefile`
- Create: `.gitignore`

**Interfaces:**
- Produces: `main()` entrypoint; a `/healthz` and `/readyz` HTTP handler pattern later tasks will extend via `internal/httpapi`.

- [ ] **Step 1: Initialize the Go module**

Run:
```bash
cd "dev/projects/rbac-generator/backend" && go mod init rbac-generator
```
Expected: creates `backend/go.mod` with `module rbac-generator` and a `go` directive.

- [ ] **Step 2: Set the Go version floor**

Edit `backend/go.mod` so it reads:
```
module rbac-generator

go 1.22
```

- [ ] **Step 3: Write the failing test for main's health handler**

```go
// backend/cmd/server/main_test.go
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthzHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	healthzHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != "ok" {
		t.Fatalf("expected body %q, got %q", "ok", rec.Body.String())
	}
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && go test ./cmd/server/...`
Expected: FAIL — `healthzHandler` is undefined.

- [ ] **Step 5: Write main.go with the health handler**

```go
// backend/cmd/server/main.go
package main

import (
	"log"
	"net/http"
	"os"
)

func healthzHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthzHandler)
	mux.HandleFunc("/readyz", healthzHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("rbac-generator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && go test ./cmd/server/...`
Expected: PASS

- [ ] **Step 7: Add the root Makefile**

```makefile
# Makefile
.PHONY: build test run image hash-password

build:
	cd backend && go build -o bin/rbac-generator ./cmd/server

test:
	cd backend && go test ./...

run: build
	PORT=$${PORT:-8080} APP_USERNAME=$${APP_USERNAME:?set APP_USERNAME} APP_PASSWORD_HASH=$${APP_PASSWORD_HASH:?set APP_PASSWORD_HASH} ./backend/bin/rbac-generator

hash-password:
	cd backend && go run ./cmd/hashpw "$(PASSWORD)"

image:
	podman build -t rbac-generator:latest -f Containerfile .
```

- [ ] **Step 8: Add .gitignore**

```
backend/bin/
frontend/node_modules/
frontend/dist/
backend/internal/httpapi/static/dist/*
!backend/internal/httpapi/static/dist/index.html
```

- [ ] **Step 9: Commit**

```bash
git add backend/go.mod backend/cmd/server/main.go backend/cmd/server/main_test.go Makefile .gitignore
git commit -m "Scaffold Go backend module with health endpoints"
```

---

### Task 2: In-memory session store

**Files:**
- Create: `backend/internal/session/store.go`
- Create: `backend/internal/session/store_test.go`

**Interfaces:**
- Produces: `session.Session{ID, Authenticated, Clientset, ClusterInfo, LastAccess}`, `session.ClusterInfo{Server, Version, CurrentContext}`, `session.NewStore(ttl time.Duration) *Store`, `(*Store) Create() *Session`, `(*Store) Get(id string) (*Session, bool)`, `(*Store) Delete(id string)`, `(*Store) RemoveExpired(now time.Time) int`, `(*Store) StartJanitor(interval time.Duration, done <-chan struct{})`, `session.NewContext(ctx, *Session) context.Context`, `session.FromContext(ctx) (*Session, bool)`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Add the client-go dependency**

Run:
```bash
cd backend && go get k8s.io/client-go@v0.31.0 k8s.io/api@v0.31.0 k8s.io/apimachinery@v0.31.0
```
Expected: `go.mod`/`go.sum` updated with these three modules.

- [ ] **Step 2: Write the failing tests**

```go
// backend/internal/session/store_test.go
package session

import (
	"testing"
	"time"
)

func TestStore_CreateAndGet(t *testing.T) {
	store := NewStore(30 * time.Minute)
	sess := store.Create()
	if sess.ID == "" {
		t.Fatal("expected non-empty session ID")
	}
	got, ok := store.Get(sess.ID)
	if !ok {
		t.Fatal("expected session to be found")
	}
	if got.ID != sess.ID {
		t.Errorf("expected ID %q, got %q", sess.ID, got.ID)
	}
}

func TestStore_GetMissing(t *testing.T) {
	store := NewStore(30 * time.Minute)
	if _, ok := store.Get("does-not-exist"); ok {
		t.Fatal("expected session not to be found")
	}
}

func TestStore_Delete(t *testing.T) {
	store := NewStore(30 * time.Minute)
	sess := store.Create()
	store.Delete(sess.ID)
	if _, ok := store.Get(sess.ID); ok {
		t.Fatal("expected session to be deleted")
	}
}

func TestStore_RemoveExpired(t *testing.T) {
	store := NewStore(10 * time.Minute)
	sess := store.Create()
	sess.LastAccess = time.Now().Add(-20 * time.Minute)

	removed := store.RemoveExpired(time.Now())
	if removed != 1 {
		t.Fatalf("expected 1 session removed, got %d", removed)
	}
	if _, ok := store.Get(sess.ID); ok {
		t.Fatal("expected expired session to be gone")
	}
}

func TestStore_RemoveExpired_KeepsFresh(t *testing.T) {
	store := NewStore(10 * time.Minute)
	sess := store.Create()

	removed := store.RemoveExpired(time.Now())
	if removed != 0 {
		t.Fatalf("expected 0 sessions removed, got %d", removed)
	}
	if _, ok := store.Get(sess.ID); !ok {
		t.Fatal("expected fresh session to remain")
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/session/...`
Expected: FAIL — package `session` has no `NewStore`/`Store`.

- [ ] **Step 4: Implement the session store**

```go
// backend/internal/session/store.go
package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
)

// ClusterInfo describes the cluster a session is currently connected to.
type ClusterInfo struct {
	Server         string
	Version        string
	CurrentContext string
}

// Session holds all per-user state: app-level auth and an optional
// cluster connection. It is never persisted to disk.
type Session struct {
	ID            string
	Authenticated bool
	Clientset     kubernetes.Interface
	ClusterInfo   *ClusterInfo
	LastAccess    time.Time
}

// Store is an in-memory, TTL-based session store.
type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
	ttl      time.Duration
}

func NewStore(ttl time.Duration) *Store {
	return &Store{sessions: make(map[string]*Session), ttl: ttl}
}

func (s *Store) Create() *Session {
	sess := &Session{ID: newID(), LastAccess: time.Now()}
	s.mu.Lock()
	s.sessions[sess.ID] = sess
	s.mu.Unlock()
	return sess
}

func (s *Store) Get(id string) (*Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, false
	}
	sess.LastAccess = time.Now()
	return sess, true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	delete(s.sessions, id)
	s.mu.Unlock()
}

// RemoveExpired deletes sessions idle longer than the store's TTL,
// relative to now. It returns the number of sessions removed.
func (s *Store) RemoveExpired(now time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for id, sess := range s.sessions {
		if now.Sub(sess.LastAccess) > s.ttl {
			delete(s.sessions, id)
			removed++
		}
	}
	return removed
}

// StartJanitor runs RemoveExpired on a fixed interval until done is closed.
func (s *Store) StartJanitor(interval time.Duration, done <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				s.RemoveExpired(time.Now())
			}
		}
	}()
}

func newID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

type contextKey struct{}

// NewContext returns a copy of ctx carrying sess.
func NewContext(ctx context.Context, sess *Session) context.Context {
	return context.WithValue(ctx, contextKey{}, sess)
}

// FromContext extracts a *Session previously stored with NewContext.
func FromContext(ctx context.Context) (*Session, bool) {
	sess, ok := ctx.Value(contextKey{}).(*Session)
	return sess, ok
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/session/...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/session
git commit -m "Add in-memory session store with TTL expiry"
```

---

### Task 3: JSON response helper, bcrypt auth, and login/logout/session handlers

**Files:**
- Create: `backend/internal/httpjson/httpjson.go`
- Create: `backend/internal/auth/auth.go`
- Create: `backend/internal/auth/auth_test.go`
- Create: `backend/cmd/hashpw/main.go`

**Interfaces:**
- Consumes: `session.Store`, `session.Session`, `session.NewContext`, `session.FromContext` (Task 2).
- Produces: `httpjson.WriteJSON(w, status, v)`, `httpjson.WriteError(w, status, message)`; `auth.Config{Username, PasswordHash}`, `auth.NewHandler(cfg, store) *Handler`, `(*Handler) Login/Logout/SessionInfo(w, r)`, `auth.Middleware(store) func(http.Handler) http.Handler`, `auth.HashPassword(password string) (string, error)`, `auth.CookieName`.

- [ ] **Step 1: Add the bcrypt dependency**

Run: `cd backend && go get golang.org/x/crypto@latest`

- [ ] **Step 2: Add the httpjson helper (no test needed — trivial wrapper exercised via auth tests)**

```go
// backend/internal/httpjson/httpjson.go
package httpjson

import (
	"encoding/json"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}
```

- [ ] **Step 3: Write the failing auth tests**

```go
// backend/internal/auth/auth_test.go
package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"rbac-generator/internal/session"
)

func newTestHandler(t *testing.T) (*Handler, *session.Store) {
	t.Helper()
	hash, err := HashPassword("s3cret")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	store := session.NewStore(30 * time.Minute)
	return NewHandler(Config{Username: "admin", PasswordHash: hash}, store), store
}

func TestLogin_Success(t *testing.T) {
	h, store := newTestHandler(t)
	body, _ := json.Marshal(loginRequest{Username: "admin", Password: "s3cret"})
	req := httptest.NewRequest(http.MethodPost, "/api/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.Login(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != CookieName {
		t.Fatalf("expected session cookie to be set, got %v", cookies)
	}
	sess, ok := store.Get(cookies[0].Value)
	if !ok || !sess.Authenticated {
		t.Fatal("expected an authenticated session to be created")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	h, _ := newTestHandler(t)
	body, _ := json.Marshal(loginRequest{Username: "admin", Password: "wrong"})
	req := httptest.NewRequest(http.MethodPost, "/api/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.Login(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestLogout_ClearsSession(t *testing.T) {
	h, store := newTestHandler(t)
	sess := store.Create()
	sess.Authenticated = true

	req := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: sess.ID})
	rec := httptest.NewRecorder()

	h.Logout(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if _, ok := store.Get(sess.ID); ok {
		t.Fatal("expected session to be removed")
	}
}

func TestSessionInfo_Unauthenticated(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	rec := httptest.NewRecorder()

	h.SessionInfo(rec, req)

	var resp sessionInfoResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Authenticated {
		t.Fatal("expected authenticated=false without a session cookie")
	}
}

func TestMiddleware_RejectsMissingCookie(t *testing.T) {
	store := session.NewStore(30 * time.Minute)
	protected := Middleware(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/connection", nil)
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMiddleware_AllowsAuthenticatedSession(t *testing.T) {
	store := session.NewStore(30 * time.Minute)
	sess := store.Create()
	sess.Authenticated = true

	protected := Middleware(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := session.FromContext(r.Context())
		if !ok || got.ID != sess.ID {
			t.Error("expected session in request context")
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/connection", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: sess.ID})
	rec := httptest.NewRecorder()

	protected.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/auth/...`
Expected: FAIL — package `auth` does not exist yet.

- [ ] **Step 5: Implement the auth package**

```go
// backend/internal/auth/auth.go
package auth

import (
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

const CookieName = "rbacgen_session"

// Config holds the single shared credential this internal tool checks
// logins against, sourced from env vars by main.go.
type Config struct {
	Username     string
	PasswordHash string
}

type Handler struct {
	cfg   Config
	store *session.Store
}

func NewHandler(cfg Config, store *session.Store) *Handler {
	return &Handler{cfg: cfg, store: store}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Username != h.cfg.Username || !checkPassword(h.cfg.PasswordHash, req.Password) {
		httpjson.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	sess := h.store.Create()
	sess.Authenticated = true

	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    sess.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((30 * time.Minute).Seconds()),
	})
	httpjson.WriteJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(CookieName); err == nil {
		h.store.Delete(c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

type sessionInfoResponse struct {
	Authenticated bool                 `json:"authenticated"`
	Connected     bool                 `json:"connected"`
	ClusterInfo   *session.ClusterInfo `json:"clusterInfo,omitempty"`
}

func (h *Handler) SessionInfo(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		httpjson.WriteJSON(w, http.StatusOK, sessionInfoResponse{})
		return
	}
	sess, ok := h.store.Get(c.Value)
	if !ok || !sess.Authenticated {
		httpjson.WriteJSON(w, http.StatusOK, sessionInfoResponse{})
		return
	}
	httpjson.WriteJSON(w, http.StatusOK, sessionInfoResponse{
		Authenticated: true,
		Connected:     sess.Clientset != nil,
		ClusterInfo:   sess.ClusterInfo,
	})
}

func checkPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// HashPassword bcrypt-hashes password for storing in APP_PASSWORD_HASH.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// Middleware rejects requests without a valid, authenticated session and
// otherwise attaches the session to the request context.
func Middleware(store *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(CookieName)
			if err != nil {
				httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			sess, ok := store.Get(c.Value)
			if !ok || !sess.Authenticated {
				httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			next.ServeHTTP(w, r.WithContext(session.NewContext(r.Context(), sess)))
		})
	}
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/auth/...`
Expected: PASS

- [ ] **Step 7: Add the hashpw CLI helper**

```go
// backend/cmd/hashpw/main.go
package main

import (
	"fmt"
	"os"

	"rbac-generator/internal/auth"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: hashpw <password>")
		os.Exit(1)
	}
	hash, err := auth.HashPassword(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}
```

- [ ] **Step 8: Verify the CLI helper builds and runs**

Run: `cd backend && go run ./cmd/hashpw "s3cret"`
Expected: prints a `$2a$...` bcrypt hash to stdout, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/httpjson backend/internal/auth backend/cmd/hashpw
git commit -m "Add bcrypt auth, session cookie middleware, and login/logout/session handlers"
```

---

### Task 4: Wire the router and main.go with auth end-to-end

**Files:**
- Create: `backend/internal/httpapi/router.go`
- Create: `backend/internal/httpapi/router_test.go`
- Modify: `backend/cmd/server/main.go` (full rewrite)
- Modify: `backend/cmd/server/main_test.go` (remove — superseded by router tests)

**Interfaces:**
- Consumes: `auth.Handler`, `auth.Middleware`, `session.Store` (Tasks 2–3).
- Produces: `httpapi.Deps{Store, Auth}`, `httpapi.NewRouter(deps Deps) http.Handler`.

- [ ] **Step 1: Add the chi router dependency**

Run: `cd backend && go get github.com/go-chi/chi/v5@latest`

- [ ] **Step 2: Write the failing router test**

```go
// backend/internal/httpapi/router_test.go
package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/session"
)

func TestRouter_LoginThenSession(t *testing.T) {
	store := session.NewStore(30 * time.Minute)
	hash, err := auth.HashPassword("s3cret")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	router := NewRouter(Deps{
		Store: store,
		Auth:  auth.NewHandler(auth.Config{Username: "admin", PasswordHash: hash}, store),
	})

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "s3cret"})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/login", bytes.NewReader(body))
	loginRec := httptest.NewRecorder()
	router.ServeHTTP(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected 200 from login, got %d", loginRec.Code)
	}
	cookies := loginRec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a session cookie")
	}

	sessionReq := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	sessionReq.AddCookie(cookies[0])
	sessionRec := httptest.NewRecorder()
	router.ServeHTTP(sessionRec, sessionReq)

	var resp struct{ Authenticated bool }
	if err := json.NewDecoder(sessionRec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !resp.Authenticated {
		t.Fatal("expected authenticated=true after login")
	}
}

func TestRouter_Healthz(t *testing.T) {
	router := NewRouter(Deps{Store: session.NewStore(30 * time.Minute)})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && go test ./internal/httpapi/...`
Expected: FAIL — package `httpapi` does not exist.

- [ ] **Step 4: Implement the router**

```go
// backend/internal/httpapi/router.go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/session"
)

// Deps wires the handlers this router needs. Fields are added to as
// later tasks introduce more handlers (connection, discovery, rbac).
type Deps struct {
	Store *session.Store
	Auth  *auth.Handler
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Get("/healthz", healthz)
	r.Get("/readyz", healthz)

	if deps.Auth != nil {
		r.Post("/api/login", deps.Auth.Login)
		r.Post("/api/logout", deps.Auth.Logout)
		r.Get("/api/session", deps.Auth.SessionInfo)
	}

	return r
}

func healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && go test ./internal/httpapi/...`
Expected: PASS

- [ ] **Step 6: Delete the now-superseded main_test.go and rewrite main.go**

Run: `rm backend/cmd/server/main_test.go`

```go
// backend/cmd/server/main.go
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/httpapi"
	"rbac-generator/internal/session"
)

func main() {
	username := os.Getenv("APP_USERNAME")
	passwordHash := os.Getenv("APP_PASSWORD_HASH")
	if username == "" || passwordHash == "" {
		log.Fatal("APP_USERNAME and APP_PASSWORD_HASH must be set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	store := session.NewStore(30 * time.Minute)
	done := make(chan struct{})
	store.StartJanitor(5*time.Minute, done)

	router := httpapi.NewRouter(httpapi.Deps{
		Store: store,
		Auth:  auth.NewHandler(auth.Config{Username: username, PasswordHash: passwordHash}, store),
	})

	log.Printf("rbac-generator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 7: Verify the whole backend still builds and tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/httpapi backend/cmd/server
git commit -m "Wire chi router with auth routes and health endpoints"
```

---

### Task 5: kubeconfig-to-clientset builder

**Files:**
- Create: `backend/internal/k8sclient/k8sclient.go`
- Create: `backend/internal/k8sclient/k8sclient_test.go`

**Interfaces:**
- Produces: `k8sclient.BuildClientset(kubeconfigYAML string) (kubernetes.Interface, *rest.Config, string, error)`, `k8sclient.VerifyConnection(ctx, kubernetes.Interface) (string, error)`.

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/k8sclient/k8sclient_test.go
package k8sclient

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/version"
	"k8s.io/client-go/kubernetes/fake"
	fakediscovery "k8s.io/client-go/discovery/fake"
)

const validKubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://example-cluster.test:6443
    insecure-skip-tls-verify: true
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
current-context: test-context
users:
- name: test-user
  user:
    token: test-token
`

func TestBuildClientset_ValidKubeconfig(t *testing.T) {
	cs, restCfg, currentContext, err := BuildClientset(validKubeconfig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cs == nil {
		t.Fatal("expected non-nil clientset")
	}
	if currentContext != "test-context" {
		t.Errorf("expected currentContext %q, got %q", "test-context", currentContext)
	}
	if restCfg.Host != "https://example-cluster.test:6443" {
		t.Errorf("unexpected host %q", restCfg.Host)
	}
}

func TestBuildClientset_InvalidKubeconfig(t *testing.T) {
	if _, _, _, err := BuildClientset("not: [valid"); err == nil {
		t.Fatal("expected error for invalid kubeconfig")
	}
}

func TestVerifyConnection_Success(t *testing.T) {
	cs := fake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.FakedServerVersion = &version.Info{GitVersion: "v1.30.0"}

	v, err := VerifyConnection(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != "v1.30.0" {
		t.Errorf("expected v1.30.0, got %q", v)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/k8sclient/...`
Expected: FAIL — package `k8sclient` does not exist.

- [ ] **Step 3: Implement the package**

```go
// backend/internal/k8sclient/k8sclient.go
package k8sclient

import (
	"context"
	"fmt"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// BuildClientset parses raw kubeconfig YAML text and builds a clientset
// from it. The raw text is never persisted by this function; callers
// are responsible for discarding it immediately after this call.
func BuildClientset(kubeconfigYAML string) (kubernetes.Interface, *rest.Config, string, error) {
	cfg, err := clientcmd.Load([]byte(kubeconfigYAML))
	if err != nil {
		return nil, nil, "", fmt.Errorf("parse kubeconfig: %w", err)
	}

	restConfig, err := clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		return nil, nil, "", fmt.Errorf("build client config: %w", err)
	}
	restConfig.Timeout = 10 * time.Second

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, "", fmt.Errorf("build clientset: %w", err)
	}

	return clientset, restConfig, cfg.CurrentContext, nil
}

// VerifyConnection performs a lightweight call to confirm the clientset
// can reach a cluster, returning its reported version string.
func VerifyConnection(_ context.Context, cs kubernetes.Interface) (string, error) {
	v, err := cs.Discovery().ServerVersion()
	if err != nil {
		return "", err
	}
	return v.GitVersion, nil
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/k8sclient/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/k8sclient
git commit -m "Add kubeconfig-to-clientset builder"
```

---

### Task 6: Connection handlers (connect/disconnect) and router wiring

**Files:**
- Create: `backend/internal/connection/connection.go`
- Create: `backend/internal/connection/connection_test.go`
- Modify: `backend/internal/httpapi/router.go` (full rewrite)
- Modify: `backend/cmd/server/main.go` (full rewrite)

**Interfaces:**
- Consumes: `k8sclient.BuildClientset`/`VerifyConnection` (Task 5), `session.Session`/`FromContext` (Task 2), `auth.Middleware` (Task 3).
- Produces: `connection.ConnectRequest{Kubeconfig}`, `connection.ConnectResponse{Server, Version, CurrentContext}`, `connection.NewHandler() *Handler`, `(*Handler) Connect/Disconnect(w, r)`.

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/connection/connection_test.go
package connection

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"

	"rbac-generator/internal/session"
)

func fakeBuildOK(kubeconfig string) (kubernetes.Interface, *rest.Config, string, error) {
	if kubeconfig == "bad" {
		return nil, nil, "", errors.New("boom")
	}
	return fake.NewSimpleClientset(), &rest.Config{Host: "https://fake.test:6443"}, "fake-context", nil
}

func fakeVerifyOK(_ context.Context, _ kubernetes.Interface) (string, error) {
	return "v1.30.0", nil
}

func fakeVerifyFail(_ context.Context, _ kubernetes.Interface) (string, error) {
	return "", errors.New("unreachable")
}

func requestWithSession(body []byte) (*http.Request, *session.Session) {
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodPost, "/api/connection", bytes.NewReader(body))
	return req.WithContext(session.NewContext(req.Context(), sess)), sess
}

func TestConnect_Success(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "good"})
	req, sess := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if sess.Clientset == nil {
		t.Fatal("expected clientset to be stored on the session")
	}
	if sess.ClusterInfo.Version != "v1.30.0" {
		t.Errorf("expected version v1.30.0, got %q", sess.ClusterInfo.Version)
	}
}

func TestConnect_InvalidKubeconfig(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "bad"})
	req, _ := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestConnect_UnreachableCluster(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyFail}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "good"})
	req, _ := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rec.Code)
	}
}

func TestDisconnect_ClearsSession(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	sess := &session.Session{ID: "s1", Authenticated: true, Clientset: fake.NewSimpleClientset(), ClusterInfo: &session.ClusterInfo{Server: "x"}}
	req := httptest.NewRequest(http.MethodDelete, "/api/connection", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Disconnect(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if sess.Clientset != nil || sess.ClusterInfo != nil {
		t.Fatal("expected session to be cleared")
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/connection/...`
Expected: FAIL — package `connection` does not exist.

- [ ] **Step 3: Implement the connection package**

```go
// backend/internal/connection/connection.go
package connection

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/k8sclient"
	"rbac-generator/internal/session"
)

type ConnectRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

type ConnectResponse struct {
	Server         string `json:"server"`
	Version        string `json:"version"`
	CurrentContext string `json:"currentContext"`
}

type buildClientsetFunc func(string) (kubernetes.Interface, *rest.Config, string, error)
type verifyFunc func(context.Context, kubernetes.Interface) (string, error)

type Handler struct {
	buildClientset buildClientsetFunc
	verify         verifyFunc
}

func NewHandler() *Handler {
	return &Handler{buildClientset: k8sclient.BuildClientset, verify: k8sclient.VerifyConnection}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Kubeconfig) == "" {
		httpjson.WriteError(w, http.StatusBadRequest, "kubeconfig is required")
		return
	}

	cs, restCfg, currentContext, err := h.buildClientset(req.Kubeconfig)
	req.Kubeconfig = "" // discard raw kubeconfig text as soon as it has been parsed
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid kubeconfig: "+err.Error())
		return
	}

	version, err := h.verify(r.Context(), cs)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, "could not reach cluster: "+err.Error())
		return
	}

	sess.Clientset = cs
	sess.ClusterInfo = &session.ClusterInfo{Server: restCfg.Host, Version: version, CurrentContext: currentContext}

	httpjson.WriteJSON(w, http.StatusOK, ConnectResponse{Server: restCfg.Host, Version: version, CurrentContext: currentContext})
}

func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sess.Clientset = nil
	sess.ClusterInfo = nil
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/connection/...`
Expected: PASS

- [ ] **Step 5: Wire the connection routes into the router**

```go
// backend/internal/httpapi/router.go (full replacement)
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/session"
)

type Deps struct {
	Store *session.Store
	Auth  *auth.Handler
	Conn  *connection.Handler
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Get("/healthz", healthz)
	r.Get("/readyz", healthz)

	if deps.Auth != nil {
		r.Post("/api/login", deps.Auth.Login)
		r.Post("/api/logout", deps.Auth.Logout)
		r.Get("/api/session", deps.Auth.SessionInfo)
	}

	if deps.Conn != nil {
		r.Route("/api/connection", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Post("/", deps.Conn.Connect)
			r.Delete("/", deps.Conn.Disconnect)
		})
	}

	return r
}

func healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
```

- [ ] **Step 6: Wire the connection handler into main.go**

```go
// backend/cmd/server/main.go (full replacement)
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/httpapi"
	"rbac-generator/internal/session"
)

func main() {
	username := os.Getenv("APP_USERNAME")
	passwordHash := os.Getenv("APP_PASSWORD_HASH")
	if username == "" || passwordHash == "" {
		log.Fatal("APP_USERNAME and APP_PASSWORD_HASH must be set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	store := session.NewStore(30 * time.Minute)
	done := make(chan struct{})
	store.StartJanitor(5*time.Minute, done)

	router := httpapi.NewRouter(httpapi.Deps{
		Store: store,
		Auth:  auth.NewHandler(auth.Config{Username: username, PasswordHash: passwordHash}, store),
		Conn:  connection.NewHandler(),
	})

	log.Printf("rbac-generator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 7: Verify everything still builds and tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/connection backend/internal/httpapi backend/cmd/server
git commit -m "Add cluster connect/disconnect handlers and wire into router"
```

---

### Task 7: Discovery, namespaces, and service accounts

**Files:**
- Create: `backend/internal/discovery/discovery.go`
- Create: `backend/internal/discovery/discovery_test.go`
- Modify: `backend/internal/httpapi/router.go` (full rewrite)
- Modify: `backend/cmd/server/main.go` (full rewrite)

**Interfaces:**
- Consumes: `session.FromContext` (Task 2).
- Produces: `discovery.Resource{Group, Version, Resource, Kind, Namespaced}`, `discovery.ResourcesResponse{Source, Resources, Verbs}`, `discovery.StaticResources()`, `discovery.StaticVerbs()`, `discovery.LiveResources(disc discovery.DiscoveryInterface) ([]Resource, error)`, `discovery.NewHandler() *Handler`, `(*Handler) Resources/Namespaces/ServiceAccounts(w, r)`.

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/discovery/discovery_test.go
package discovery

import (
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/go-chi/chi/v5"

	"rbac-generator/internal/session"
)

func TestStaticResources_NotEmpty(t *testing.T) {
	if len(StaticResources()) == 0 {
		t.Fatal("expected a non-empty static resource list")
	}
	if len(StaticVerbs()) == 0 {
		t.Fatal("expected a non-empty static verb list")
	}
}

func TestHandler_Resources_FallsBackToStaticWhenNotConnected(t *testing.T) {
	h := NewHandler()
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodGet, "/api/discovery/resources", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Resources(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandler_Namespaces_RequiresConnection(t *testing.T) {
	h := NewHandler()
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodGet, "/api/namespaces", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Namespaces(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 when not connected, got %d", rec.Code)
	}
}

func TestHandler_Namespaces_ListsFromClientset(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}})
	sess := &session.Session{ID: "s1", Authenticated: true, Clientset: cs}
	req := httptest.NewRequest(http.MethodGet, "/api/namespaces", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Namespaces(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "[\"default\"]\n" {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}

func TestHandler_ServiceAccounts_ListsForNamespace(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset(&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "builder", Namespace: "default"}})
	sess := &session.Session{ID: "s1", Authenticated: true, Clientset: cs}

	r := chi.NewRouter()
	r.Get("/api/namespaces/{namespace}/serviceaccounts", h.ServiceAccounts)

	req := httptest.NewRequest(http.MethodGet, "/api/namespaces/default/serviceaccounts", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "[\"builder\"]\n" {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/discovery/...`
Expected: FAIL — package `discovery` does not exist.

- [ ] **Step 3: Implement the discovery package**

```go
// backend/internal/discovery/discovery.go
package discovery

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sdiscovery "k8s.io/client-go/discovery"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

type Resource struct {
	Group      string `json:"group"`
	Version    string `json:"version"`
	Resource   string `json:"resource"`
	Kind       string `json:"kind"`
	Namespaced bool   `json:"namespaced"`
}

type ResourcesResponse struct {
	Source    string     `json:"source"`
	Resources []Resource `json:"resources"`
	Verbs     []string   `json:"verbs"`
}

var staticVerbs = []string{"get", "list", "watch", "create", "update", "patch", "delete", "deletecollection", "*"}

var staticResources = []Resource{
	{Group: "", Version: "v1", Resource: "pods", Kind: "Pod", Namespaced: true},
	{Group: "", Version: "v1", Resource: "services", Kind: "Service", Namespaced: true},
	{Group: "", Version: "v1", Resource: "configmaps", Kind: "ConfigMap", Namespaced: true},
	{Group: "", Version: "v1", Resource: "secrets", Kind: "Secret", Namespaced: true},
	{Group: "", Version: "v1", Resource: "namespaces", Kind: "Namespace", Namespaced: false},
	{Group: "", Version: "v1", Resource: "nodes", Kind: "Node", Namespaced: false},
	{Group: "", Version: "v1", Resource: "persistentvolumeclaims", Kind: "PersistentVolumeClaim", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "deployments", Kind: "Deployment", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "statefulsets", Kind: "StatefulSet", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "daemonsets", Kind: "DaemonSet", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "replicasets", Kind: "ReplicaSet", Namespaced: true},
	{Group: "batch", Version: "v1", Resource: "jobs", Kind: "Job", Namespaced: true},
	{Group: "batch", Version: "v1", Resource: "cronjobs", Kind: "CronJob", Namespaced: true},
	{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses", Kind: "Ingress", Namespaced: true},
	{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies", Kind: "NetworkPolicy", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles", Kind: "Role", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings", Kind: "RoleBinding", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles", Kind: "ClusterRole", Namespaced: false},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings", Kind: "ClusterRoleBinding", Namespaced: false},
}

func StaticVerbs() []string     { return staticVerbs }
func StaticResources() []Resource { return staticResources }

// LiveResources queries cluster API discovery for the current apiGroups
// and resources, skipping subresources (e.g. pods/status).
func LiveResources(disc k8sdiscovery.DiscoveryInterface) ([]Resource, error) {
	_, apiLists, err := disc.ServerGroupsAndResources()
	if len(apiLists) == 0 {
		return nil, err
	}
	var out []Resource
	for _, list := range apiLists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		for _, res := range list.APIResources {
			if strings.Contains(res.Name, "/") {
				continue
			}
			out = append(out, Resource{
				Group:      gv.Group,
				Version:    gv.Version,
				Resource:   res.Name,
				Kind:       res.Kind,
				Namespaced: res.Namespaced,
			})
		}
	}
	return out, nil
}

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Resources(w http.ResponseWriter, r *http.Request) {
	sess, _ := session.FromContext(r.Context())
	if sess != nil && sess.Clientset != nil {
		if resources, err := LiveResources(sess.Clientset.Discovery()); err == nil && len(resources) > 0 {
			httpjson.WriteJSON(w, http.StatusOK, ResourcesResponse{Source: "live", Resources: resources, Verbs: StaticVerbs()})
			return
		}
	}
	httpjson.WriteJSON(w, http.StatusOK, ResourcesResponse{Source: "static", Resources: StaticResources(), Verbs: StaticVerbs()})
}

func (h *Handler) Namespaces(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}
	list, err := sess.Clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	httpjson.WriteJSON(w, http.StatusOK, names)
}

func (h *Handler) ServiceAccounts(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}
	namespace := chi.URLParam(r, "namespace")
	list, err := sess.Clientset.CoreV1().ServiceAccounts(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	names := make([]string, 0, len(list.Items))
	for _, sa := range list.Items {
		names = append(names, sa.Name)
	}
	httpjson.WriteJSON(w, http.StatusOK, names)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/discovery/...`
Expected: PASS

- [ ] **Step 5: Wire discovery routes into the router**

```go
// backend/internal/httpapi/router.go (full replacement)
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/discovery"
	"rbac-generator/internal/session"
)

type Deps struct {
	Store     *session.Store
	Auth      *auth.Handler
	Conn      *connection.Handler
	Discovery *discovery.Handler
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Get("/healthz", healthz)
	r.Get("/readyz", healthz)

	if deps.Auth != nil {
		r.Post("/api/login", deps.Auth.Login)
		r.Post("/api/logout", deps.Auth.Logout)
		r.Get("/api/session", deps.Auth.SessionInfo)
	}

	if deps.Conn != nil {
		r.Route("/api/connection", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Post("/", deps.Conn.Connect)
			r.Delete("/", deps.Conn.Disconnect)
		})
	}

	if deps.Discovery != nil {
		r.Route("/api/discovery", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Get("/resources", deps.Discovery.Resources)
		})
		r.Route("/api/namespaces", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Get("/", deps.Discovery.Namespaces)
			r.Get("/{namespace}/serviceaccounts", deps.Discovery.ServiceAccounts)
		})
	}

	return r
}

func healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
```

- [ ] **Step 6: Wire the discovery handler into main.go**

```go
// backend/cmd/server/main.go (full replacement)
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/discovery"
	"rbac-generator/internal/httpapi"
	"rbac-generator/internal/session"
)

func main() {
	username := os.Getenv("APP_USERNAME")
	passwordHash := os.Getenv("APP_PASSWORD_HASH")
	if username == "" || passwordHash == "" {
		log.Fatal("APP_USERNAME and APP_PASSWORD_HASH must be set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	store := session.NewStore(30 * time.Minute)
	done := make(chan struct{})
	store.StartJanitor(5*time.Minute, done)

	router := httpapi.NewRouter(httpapi.Deps{
		Store:     store,
		Auth:      auth.NewHandler(auth.Config{Username: username, PasswordHash: passwordHash}, store),
		Conn:      connection.NewHandler(),
		Discovery: discovery.NewHandler(),
	})

	log.Printf("rbac-generator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 7: Verify everything still builds and tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/discovery backend/internal/httpapi backend/cmd/server
git commit -m "Add discovery, namespace, and service account endpoints"
```

---

### Task 8: RBAC object types and builders

**Files:**
- Create: `backend/internal/rbac/types.go`
- Create: `backend/internal/rbac/builders.go`
- Create: `backend/internal/rbac/builders_test.go`

**Interfaces:**
- Produces: `rbac.Kind` (+ `KindRole`/`KindClusterRole`/`KindRoleBinding`/`KindClusterRoleBinding`), `rbac.PolicyRuleInput`, `rbac.SubjectInput`, `rbac.RoleRefInput`, `rbac.CreateRequest`, `rbac.BuildRole/BuildClusterRole/BuildRoleBinding/BuildClusterRoleBinding(req CreateRequest) (*rbacv1.X, error)`.

- [ ] **Step 1: Write the failing builder tests**

```go
// backend/internal/rbac/builders_test.go
package rbac

import "testing"

func TestBuildRole_Success(t *testing.T) {
	req := CreateRequest{
		Name:      "reader",
		Namespace: "default",
		Rules:     []PolicyRuleInput{{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}}},
	}
	role, err := BuildRole(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role.Name != "reader" || role.Namespace != "default" {
		t.Errorf("unexpected metadata: %+v", role.ObjectMeta)
	}
	if len(role.Rules) != 1 || role.Rules[0].Resources[0] != "pods" {
		t.Errorf("unexpected rules: %+v", role.Rules)
	}
}

func TestBuildRole_RequiresNamespace(t *testing.T) {
	req := CreateRequest{Name: "reader", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when namespace is missing")
	}
}

func TestBuildRole_RequiresAtLeastOneRule(t *testing.T) {
	req := CreateRequest{Name: "reader", Namespace: "default"}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when no rules are given")
	}
}

func TestBuildRole_RequiresVerbsPerRule(t *testing.T) {
	req := CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Resources: []string{"pods"}}}}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when a rule has no verbs")
	}
}

func TestBuildClusterRole_Success(t *testing.T) {
	req := CreateRequest{
		Name:  "cluster-reader",
		Rules: []PolicyRuleInput{{Resources: []string{"nodes"}, Verbs: []string{"get"}}},
	}
	cr, err := BuildClusterRole(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cr.Name != "cluster-reader" {
		t.Errorf("unexpected name: %q", cr.Name)
	}
}

func TestBuildRoleBinding_Success(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		RoleRef:   &RoleRefInput{Kind: "Role", Name: "reader"},
		Subjects:  []SubjectInput{{Kind: "ServiceAccount", Name: "builder", Namespace: "default"}},
	}
	rb, err := BuildRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rb.RoleRef.Kind != "Role" || rb.RoleRef.Name != "reader" {
		t.Errorf("unexpected roleRef: %+v", rb.RoleRef)
	}
	if len(rb.Subjects) != 1 || rb.Subjects[0].APIGroup != "" {
		t.Errorf("expected ServiceAccount subject with empty apiGroup, got %+v", rb.Subjects)
	}
}

func TestBuildRoleBinding_UserSubjectGetsRbacAPIGroup(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		RoleRef:   &RoleRefInput{Kind: "Role", Name: "reader"},
		Subjects:  []SubjectInput{{Kind: "User", Name: "alice"}},
	}
	rb, err := BuildRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rb.Subjects[0].APIGroup != "rbac.authorization.k8s.io" {
		t.Errorf("expected rbac.authorization.k8s.io apiGroup for User subject, got %q", rb.Subjects[0].APIGroup)
	}
}

func TestBuildRoleBinding_RequiresRoleRef(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		Subjects:  []SubjectInput{{Kind: "User", Name: "alice"}},
	}
	if _, err := BuildRoleBinding(req); err == nil {
		t.Fatal("expected error when roleRef is missing")
	}
}

func TestBuildClusterRoleBinding_Success(t *testing.T) {
	req := CreateRequest{
		Name:     "cluster-reader-binding",
		RoleRef:  &RoleRefInput{Kind: "ClusterRole", Name: "cluster-reader"},
		Subjects: []SubjectInput{{Kind: "Group", Name: "admins"}},
	}
	crb, err := BuildClusterRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if crb.RoleRef.Name != "cluster-reader" {
		t.Errorf("unexpected roleRef name: %q", crb.RoleRef.Name)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/rbac/...`
Expected: FAIL — package `rbac` does not exist.

- [ ] **Step 3: Add the k8s.io/api rbac/v1 types file**

```go
// backend/internal/rbac/types.go
package rbac

// Kind identifies which of the four RBAC resource kinds a request targets,
// matching the REST API's {kind} path segment.
type Kind string

const (
	KindRole               Kind = "roles"
	KindClusterRole        Kind = "clusterroles"
	KindRoleBinding        Kind = "rolebindings"
	KindClusterRoleBinding Kind = "clusterrolebindings"
)

type PolicyRuleInput struct {
	APIGroups     []string `json:"apiGroups"`
	Resources     []string `json:"resources"`
	Verbs         []string `json:"verbs"`
	ResourceNames []string `json:"resourceNames,omitempty"`
}

type SubjectInput struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

type RoleRefInput struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type CreateRequest struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace,omitempty"`
	Rules     []PolicyRuleInput `json:"rules,omitempty"`
	Subjects  []SubjectInput    `json:"subjects,omitempty"`
	RoleRef   *RoleRefInput     `json:"roleRef,omitempty"`
}
```

- [ ] **Step 4: Implement the builders**

```go
// backend/internal/rbac/builders.go
package rbac

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func BuildRole(req CreateRequest) (*rbacv1.Role, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Namespace == "" {
		return nil, fmt.Errorf("namespace is required for Role")
	}
	rules, err := buildPolicyRules(req.Rules)
	if err != nil {
		return nil, err
	}
	return &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name, Namespace: req.Namespace},
		Rules:      rules,
	}, nil
}

func BuildClusterRole(req CreateRequest) (*rbacv1.ClusterRole, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	rules, err := buildPolicyRules(req.Rules)
	if err != nil {
		return nil, err
	}
	return &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name},
		Rules:      rules,
	}, nil
}

func BuildRoleBinding(req CreateRequest) (*rbacv1.RoleBinding, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Namespace == "" {
		return nil, fmt.Errorf("namespace is required for RoleBinding")
	}
	if req.RoleRef == nil || req.RoleRef.Name == "" {
		return nil, fmt.Errorf("roleRef is required")
	}
	subjects, err := buildSubjects(req.Subjects)
	if err != nil {
		return nil, err
	}
	return &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name, Namespace: req.Namespace},
		RoleRef: rbacv1.RoleRef{
			APIGroup: rbacv1.GroupName,
			Kind:     req.RoleRef.Kind,
			Name:     req.RoleRef.Name,
		},
		Subjects: subjects,
	}, nil
}

func BuildClusterRoleBinding(req CreateRequest) (*rbacv1.ClusterRoleBinding, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.RoleRef == nil || req.RoleRef.Name == "" {
		return nil, fmt.Errorf("roleRef is required")
	}
	subjects, err := buildSubjects(req.Subjects)
	if err != nil {
		return nil, err
	}
	return &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name},
		RoleRef: rbacv1.RoleRef{
			APIGroup: rbacv1.GroupName,
			Kind:     req.RoleRef.Kind,
			Name:     req.RoleRef.Name,
		},
		Subjects: subjects,
	}, nil
}

func buildPolicyRules(inputs []PolicyRuleInput) ([]rbacv1.PolicyRule, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("at least one rule is required")
	}
	rules := make([]rbacv1.PolicyRule, 0, len(inputs))
	for i, in := range inputs {
		if len(in.Verbs) == 0 {
			return nil, fmt.Errorf("rule %d: at least one verb is required", i)
		}
		rules = append(rules, rbacv1.PolicyRule{
			APIGroups:     in.APIGroups,
			Resources:     in.Resources,
			Verbs:         in.Verbs,
			ResourceNames: in.ResourceNames,
		})
	}
	return rules, nil
}

func buildSubjects(inputs []SubjectInput) ([]rbacv1.Subject, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("at least one subject is required")
	}
	subjects := make([]rbacv1.Subject, 0, len(inputs))
	for i, in := range inputs {
		if in.Kind == "" || in.Name == "" {
			return nil, fmt.Errorf("subject %d: kind and name are required", i)
		}
		apiGroup := rbacv1.GroupName
		if in.Kind == rbacv1.ServiceAccountKind {
			apiGroup = ""
		}
		subjects = append(subjects, rbacv1.Subject{
			Kind:      in.Kind,
			Name:      in.Name,
			Namespace: in.Namespace,
			APIGroup:  apiGroup,
		})
	}
	return subjects, nil
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/rbac/...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/rbac
git commit -m "Add RBAC request types and Role/ClusterRole/RoleBinding/ClusterRoleBinding builders"
```

---

### Task 9: RBAC handlers (dry-run, create, list, get) and final router wiring

**Files:**
- Create: `backend/internal/rbac/handlers.go`
- Create: `backend/internal/rbac/handlers_test.go`
- Modify: `backend/internal/httpapi/router.go` (full rewrite)
- Modify: `backend/cmd/server/main.go` (full rewrite)

**Interfaces:**
- Consumes: `BuildRole`/`BuildClusterRole`/`BuildRoleBinding`/`BuildClusterRoleBinding`, `CreateRequest` (Task 8); `session.FromContext` (Task 2).
- Produces: `rbac.NewHandler() *Handler`, `(*Handler) DryRun/Create/List/Get(w, r)`.

- [ ] **Step 1: Write the failing handler tests**

```go
// backend/internal/rbac/handlers_test.go
package rbac

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"rbac-generator/internal/session"
)

func newRequest(t *testing.T, method, path string, body []byte, cs *fake.Clientset, params map[string]string) *http.Request {
	t.Helper()
	sess := &session.Session{ID: "s1", Authenticated: true, Clientset: cs}

	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}

	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = session.NewContext(ctx, sess)
	return req.WithContext(ctx)
}

func TestHandler_Create_Role(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{
		Name:      "reader",
		Namespace: "default",
		Rules:     []PolicyRuleInput{{Resources: []string{"pods"}, Verbs: []string{"get"}}},
	})
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	created, err := cs.RbacV1().Roles("default").Get(context.Background(), "reader", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("expected role to be created: %v", err)
	}
	if created.Name != "reader" {
		t.Errorf("unexpected name: %q", created.Name)
	}
}

func TestHandler_Create_InvalidBuild(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{Namespace: "default"}) // missing name
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_Create_NotConnected(t *testing.T) {
	h := NewHandler()
	body, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}})
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, nil, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rec.Code)
	}
}

func TestHandler_DryRun_DoesNotPersist(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{
		Name: "cluster-reader",
		Rules: []PolicyRuleInput{{Resources: []string{"nodes"}, Verbs: []string{"get"}}},
	})
	req := newRequest(t, http.MethodPost, "/api/rbac/clusterroles/dry-run", body, cs, map[string]string{"kind": "clusterroles"})
	rec := httptest.NewRecorder()

	h.DryRun(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// The fake clientset does not honor server-side dry-run, so this only
	// verifies the handler routes DryRun through without error; the real
	// API server enforces DryRun: ["All"] on a live cluster.
}

func TestHandler_List_Roles(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/roles", createBody, cs, map[string]string{"kind": "roles"})
	h.Create(httptest.NewRecorder(), createReq)

	listReq := newRequest(t, http.MethodGet, "/api/rbac/roles?namespace=default", nil, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.List(rec, listReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 role, got %d", len(items))
	}
}

func TestHandler_Get_Role(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/roles", createBody, cs, map[string]string{"kind": "roles"})
	h.Create(httptest.NewRecorder(), createReq)

	getReq := newRequest(t, http.MethodGet, "/api/rbac/roles/default/reader", nil, cs, map[string]string{"kind": "roles", "namespace": "default", "name": "reader"})
	rec := httptest.NewRecorder()

	h.Get(rec, getReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_Get_ClusterScoped_NoNamespaceSegment(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "cluster-reader", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/clusterroles", createBody, cs, map[string]string{"kind": "clusterroles"})
	h.Create(httptest.NewRecorder(), createReq)

	getReq := newRequest(t, http.MethodGet, "/api/rbac/clusterroles/cluster-reader", nil, cs, map[string]string{"kind": "clusterroles", "name": "cluster-reader"})
	rec := httptest.NewRecorder()

	h.Get(rec, getReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/rbac/...`
Expected: FAIL — `NewHandler`, `Create`, `DryRun`, `List`, `Get` are undefined.

- [ ] **Step 3: Implement the handlers**

```go
// backend/internal/rbac/handlers.go
package rbac

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) DryRun(w http.ResponseWriter, r *http.Request) {
	h.handleWrite(w, r, true)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	h.handleWrite(w, r, false)
}

func (h *Handler) handleWrite(w http.ResponseWriter, r *http.Request, dryRun bool) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	ctx := r.Context()
	opts := metav1.CreateOptions{}
	if dryRun {
		opts.DryRun = []string{metav1.DryRunAll}
	}

	var result interface{}
	var err error

	switch kind {
	case KindRole:
		obj, buildErr := BuildRole(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().Roles(req.Namespace).Create(ctx, obj, opts)
	case KindClusterRole:
		obj, buildErr := BuildClusterRole(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().ClusterRoles().Create(ctx, obj, opts)
	case KindRoleBinding:
		obj, buildErr := BuildRoleBinding(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().RoleBindings(req.Namespace).Create(ctx, obj, opts)
	case KindClusterRoleBinding:
		obj, buildErr := BuildClusterRoleBinding(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().ClusterRoleBindings().Create(ctx, obj, opts)
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
		return
	}

	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpjson.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	namespace := r.URL.Query().Get("namespace")
	ctx := r.Context()

	switch kind {
	case KindRole:
		list, err := sess.Clientset.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, list.Items)
	case KindClusterRole:
		list, err := sess.Clientset.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, list.Items)
	case KindRoleBinding:
		list, err := sess.Clientset.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, list.Items)
	case KindClusterRoleBinding:
		list, err := sess.Clientset.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, list.Items)
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
	}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	ctx := r.Context()

	switch kind {
	case KindRole:
		obj, err := sess.Clientset.RbacV1().Roles(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, obj)
	case KindClusterRole:
		obj, err := sess.Clientset.RbacV1().ClusterRoles().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, obj)
	case KindRoleBinding:
		obj, err := sess.Clientset.RbacV1().RoleBindings(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, obj)
	case KindClusterRoleBinding:
		obj, err := sess.Clientset.RbacV1().ClusterRoleBindings().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, obj)
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/rbac/...`
Expected: PASS

- [ ] **Step 5: Wire RBAC routes into the router (final router.go)**

```go
// backend/internal/httpapi/router.go (full replacement)
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/discovery"
	"rbac-generator/internal/rbac"
	"rbac-generator/internal/session"
)

type Deps struct {
	Store     *session.Store
	Auth      *auth.Handler
	Conn      *connection.Handler
	Discovery *discovery.Handler
	RBAC      *rbac.Handler
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Get("/healthz", healthz)
	r.Get("/readyz", healthz)

	if deps.Auth != nil {
		r.Post("/api/login", deps.Auth.Login)
		r.Post("/api/logout", deps.Auth.Logout)
		r.Get("/api/session", deps.Auth.SessionInfo)
	}

	if deps.Conn != nil {
		r.Route("/api/connection", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Post("/", deps.Conn.Connect)
			r.Delete("/", deps.Conn.Disconnect)
		})
	}

	if deps.Discovery != nil {
		r.Route("/api/discovery", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Get("/resources", deps.Discovery.Resources)
		})
		r.Route("/api/namespaces", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Get("/", deps.Discovery.Namespaces)
			r.Get("/{namespace}/serviceaccounts", deps.Discovery.ServiceAccounts)
		})
	}

	if deps.RBAC != nil {
		r.Route("/api/rbac/{kind}", func(r chi.Router) {
			r.Use(auth.Middleware(deps.Store))
			r.Post("/dry-run", deps.RBAC.DryRun)
			r.Post("/", deps.RBAC.Create)
			r.Get("/", deps.RBAC.List)
			r.Get("/{name}", deps.RBAC.Get)
			r.Get("/{namespace}/{name}", deps.RBAC.Get)
		})
	}

	return r
}

func healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
```

- [ ] **Step 6: Wire the RBAC handler into main.go**

```go
// backend/cmd/server/main.go (full replacement)
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"rbac-generator/internal/auth"
	"rbac-generator/internal/connection"
	"rbac-generator/internal/discovery"
	"rbac-generator/internal/httpapi"
	"rbac-generator/internal/rbac"
	"rbac-generator/internal/session"
)

func main() {
	username := os.Getenv("APP_USERNAME")
	passwordHash := os.Getenv("APP_PASSWORD_HASH")
	if username == "" || passwordHash == "" {
		log.Fatal("APP_USERNAME and APP_PASSWORD_HASH must be set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	store := session.NewStore(30 * time.Minute)
	done := make(chan struct{})
	store.StartJanitor(5*time.Minute, done)

	router := httpapi.NewRouter(httpapi.Deps{
		Store:     store,
		Auth:      auth.NewHandler(auth.Config{Username: username, PasswordHash: passwordHash}, store),
		Conn:      connection.NewHandler(),
		Discovery: discovery.NewHandler(),
		RBAC:      rbac.NewHandler(),
	})

	log.Printf("rbac-generator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 7: Verify everything still builds and tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/rbac backend/internal/httpapi backend/cmd/server
git commit -m "Add RBAC dry-run/create/list/get handlers and finish router wiring"
```

---

### Task 10: Embed the frontend build and serve it as a SPA fallback

**Files:**
- Create: `backend/internal/httpapi/static.go`
- Create: `backend/internal/httpapi/static/dist/index.html` (placeholder, overwritten by the real frontend build)
- Create: `backend/internal/httpapi/static_test.go`
- Modify: `backend/internal/httpapi/router.go` (add the static handler route)

**Interfaces:**
- Produces: `httpapi.staticHandler() http.Handler` (package-private, wired into the router).

- [ ] **Step 1: Add the placeholder static asset**

```html
<!-- backend/internal/httpapi/static/dist/index.html -->
<!doctype html>
<html>
  <body>Frontend not built yet. Run the frontend build to populate this directory.</body>
</html>
```

- [ ] **Step 2: Write the failing static handler test**

```go
// backend/internal/httpapi/static_test.go
package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStaticHandler_ServesIndex(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	staticHandler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestStaticHandler_FallsBackToIndexForUnknownPath(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/create", nil)
	rec := httptest.NewRecorder()

	staticHandler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (SPA fallback to index.html), got %d", rec.Code)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && go test ./internal/httpapi/...`
Expected: FAIL — `staticHandler` is undefined.

- [ ] **Step 4: Implement the embedded static handler**

```go
// backend/internal/httpapi/static.go
package httpapi

import (
	"embed"
	"io/fs"
	"net/http"
	"net/url"
	"strings"
)

//go:embed static/dist
var staticFS embed.FS

// staticHandler serves the embedded frontend build, falling back to
// index.html for any path that isn't a real file so client-side routes
// (e.g. /create, /browse) work on a hard refresh.
func staticHandler() http.Handler {
	sub, err := fs.Sub(staticFS, "static/dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimPrefix(r.URL.Path, "/")
		if cleanPath == "" {
			cleanPath = "index.html"
		}
		if _, err := fs.Stat(sub, cleanPath); err != nil {
			fallback := new(http.Request)
			*fallback = *r
			fallback.URL = &url.URL{Path: "/"}
			fileServer.ServeHTTP(w, fallback)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && go test ./internal/httpapi/...`
Expected: PASS

- [ ] **Step 6: Wire the static handler as the catch-all route**

```go
// backend/internal/httpapi/router.go — add this line as the last route registered,
// right before the closing `return r` statement:
	r.Handle("/*", staticHandler())
```

- [ ] **Step 7: Verify everything still builds and tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/httpapi
git commit -m "Embed and serve the frontend build with SPA fallback routing"
```

---

## Frontend

### Task 11: Scaffold the Vite + React + TypeScript + PatternFly6 project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx` (minimal placeholder, replaced in Task 21)
- Create: `frontend/src/App.test.tsx` (minimal placeholder, replaced in Task 21)

**Interfaces:**
- Produces: a working `npm run dev`, `npm run build`, `npm test` toolchain that later tasks build on.

- [ ] **Step 1: Scaffold with Vite's React-TS template**

Run:
```bash
cd "dev/projects/rbac-generator" && npm create vite@latest frontend -- --template react-ts
```
Expected: creates `frontend/` with a default Vite React+TS app.

- [ ] **Step 2: Install PatternFly 6 and supporting libraries**

Run:
```bash
cd frontend && npm install @patternfly/react-core@^6 @patternfly/react-table@^6 @patternfly/react-code-editor@^6 @patternfly/react-icons@^6 js-yaml
npm install -D @types/js-yaml vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add Vitest config to vite.config.ts**

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
  },
});
```

- [ ] **Step 4: Add the Vitest setup file**

```ts
// frontend/vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Add the test script to package.json**

Edit `frontend/package.json` `scripts` section to include:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "test": "vitest run",
  "preview": "vite preview"
}
```

- [ ] **Step 6: Replace the default App with a minimal placeholder and its test**

```tsx
// frontend/src/App.tsx
export function App() {
  return <div>rbac-generator</div>;
}
```

```tsx
// frontend/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders', () => {
    render(<App />);
    expect(screen.getByText('rbac-generator')).toBeInTheDocument();
  });
});
```

```tsx
// frontend/src/main.tsx
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import { App } from './App';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
```

```html
<!-- frontend/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>rbac-generator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (1 test).

- [ ] **Step 8: Verify the production build works**

Run: `cd frontend && npm run build`
Expected: succeeds, produces `frontend/dist/`.

- [ ] **Step 9: Commit**

```bash
git add frontend package-lock.json
git commit -m "Scaffold Vite + React + TypeScript + PatternFly6 frontend"
```

---

### Task 12: Shared types and the YAML sync helper

**Files:**
- Create: `frontend/src/types/rbac.ts`
- Create: `frontend/src/lib/yamlSync.ts`
- Create: `frontend/src/lib/yamlSync.test.ts`

**Interfaces:**
- Produces: `Kind`, `PolicyRule`, `Subject`, `RoleRef`, `RbacResource`, `DiscoveryResource`, `DiscoveryResponse`, `ClusterInfo`, `SessionInfo`, `isNamespaced(kind)`, `requiresRules(kind)`, `requiresSubjects(kind)` (types); `toYaml(value)`, `fromYaml(text, expectedKind)` (lib).

- [ ] **Step 1: Write the failing yamlSync tests**

```ts
// frontend/src/lib/yamlSync.test.ts
import { describe, expect, it } from 'vitest';
import { toYaml, fromYaml } from './yamlSync';

describe('yamlSync', () => {
  it('round-trips an object through YAML', () => {
    const value = { kind: 'Role', name: 'reader', rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }] };
    const text = toYaml(value);
    const parsed = fromYaml<typeof value>(text, 'Role');
    expect(parsed).toEqual(value);
  });

  it('throws when the kind does not match', () => {
    const text = toYaml({ kind: 'ClusterRole', name: 'x' });
    expect(() => fromYaml(text, 'Role')).toThrow('Expected kind "Role", got "ClusterRole"');
  });

  it('throws on YAML that is not an object', () => {
    expect(() => fromYaml('- just\n- a\n- list', 'Role')).toThrow('YAML must describe an object');
  });

  it('allows a missing kind field', () => {
    const value = { name: 'reader' };
    const text = toYaml(value);
    expect(() => fromYaml(text, 'Role')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- yamlSync`
Expected: FAIL — module `./yamlSync` does not exist.

- [ ] **Step 3: Add the shared RBAC types**

```ts
// frontend/src/types/rbac.ts
export type Kind = 'roles' | 'clusterroles' | 'rolebindings' | 'clusterrolebindings';

export interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
  resourceNames?: string[];
}

export interface Subject {
  kind: 'ServiceAccount' | 'User' | 'Group';
  name: string;
  namespace?: string;
}

export interface RoleRef {
  kind: 'Role' | 'ClusterRole';
  name: string;
}

export interface RbacResource {
  name: string;
  namespace?: string;
  rules?: PolicyRule[];
  subjects?: Subject[];
  roleRef?: RoleRef;
}

export interface DiscoveryResource {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
}

export interface DiscoveryResponse {
  source: 'live' | 'static';
  resources: DiscoveryResource[];
  verbs: string[];
}

export interface ClusterInfo {
  server: string;
  version: string;
  currentContext: string;
}

export interface SessionInfo {
  authenticated: boolean;
  connected: boolean;
  clusterInfo?: ClusterInfo;
}

export function isNamespaced(kind: Kind): boolean {
  return kind === 'roles' || kind === 'rolebindings';
}

export function requiresRules(kind: Kind): boolean {
  return kind === 'roles' || kind === 'clusterroles';
}

export function requiresSubjects(kind: Kind): boolean {
  return kind === 'rolebindings' || kind === 'clusterrolebindings';
}
```

- [ ] **Step 4: Implement the YAML sync helper**

```ts
// frontend/src/lib/yamlSync.ts
import yaml from 'js-yaml';

export function toYaml<T>(value: T): string {
  return yaml.dump(value);
}

export function fromYaml<T>(text: string, expectedKind: string): T {
  const parsed = yaml.load(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML must describe an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.kind && obj.kind !== expectedKind) {
    throw new Error(`Expected kind "${expectedKind}", got "${String(obj.kind)}"`);
  }
  return obj as T;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npm test -- yamlSync`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types frontend/src/lib
git commit -m "Add shared RBAC types and YAML sync helper"
```

---

### Task 13: Typed API client

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: `Kind`, `RbacResource`, `DiscoveryResponse`, `ClusterInfo`, `SessionInfo` (Task 12).
- Produces: `login`, `logout`, `getSession`, `connect`, `disconnect`, `getDiscoveryResources`, `getNamespaces`, `getServiceAccounts`, `dryRun`, `createResource`, `listResources`, `getResource`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/api/client.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getSession } from './client';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('login posts credentials and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await login('admin', 's3cret');

    expect(result).toEqual({ authenticated: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'admin', password: 's3cret' }) }),
    );
  });

  it('throws with the server error message on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'invalid credentials' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('admin', 'wrong')).rejects.toThrow('invalid credentials');
  });

  it('getSession returns the default state on a fresh session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: false, connected: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getSession();

    expect(result.authenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- client`
Expected: FAIL — module `./client` does not exist.

- [ ] **Step 3: Implement the API client**

```ts
// frontend/src/api/client.ts
import type { RbacResource, Kind, DiscoveryResponse, ClusterInfo, SessionInfo } from '../types/rbac';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function login(username: string, password: string): Promise<{ authenticated: boolean }> {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<void> {
  return request('/api/logout', { method: 'POST' });
}

export function getSession(): Promise<SessionInfo> {
  return request('/api/session');
}

export function connect(kubeconfig: string): Promise<ClusterInfo> {
  return request('/api/connection', { method: 'POST', body: JSON.stringify({ kubeconfig }) });
}

export function disconnect(): Promise<void> {
  return request('/api/connection', { method: 'DELETE' });
}

export function getDiscoveryResources(): Promise<DiscoveryResponse> {
  return request('/api/discovery/resources');
}

export function getNamespaces(): Promise<string[]> {
  return request('/api/namespaces');
}

export function getServiceAccounts(namespace: string): Promise<string[]> {
  return request(`/api/namespaces/${encodeURIComponent(namespace)}/serviceaccounts`);
}

export function dryRun(kind: Kind, resource: RbacResource): Promise<unknown> {
  return request(`/api/rbac/${kind}/dry-run`, { method: 'POST', body: JSON.stringify(resource) });
}

export function createResource(kind: Kind, resource: RbacResource): Promise<unknown> {
  return request(`/api/rbac/${kind}`, { method: 'POST', body: JSON.stringify(resource) });
}

export function listResources(kind: Kind, namespace?: string): Promise<RbacResource[]> {
  const qs = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
  return request(`/api/rbac/${kind}${qs}`);
}

export function getResource(kind: Kind, name: string, namespace?: string): Promise<RbacResource> {
  const path = namespace
    ? `/api/rbac/${kind}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
    : `/api/rbac/${kind}/${encodeURIComponent(name)}`;
  return request(path);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "Add typed REST API client"
```

---

### Task 14: RuleBuilder component

**Files:**
- Create: `frontend/src/components/RuleBuilder.tsx`
- Create: `frontend/src/components/RuleBuilder.test.tsx`

**Interfaces:**
- Consumes: `PolicyRule` (Task 12).
- Produces: `RuleBuilder({ rules, onChange, resourceOptions?, groupOptions?, verbOptions? })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/RuleBuilder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RuleBuilder } from './RuleBuilder';

describe('RuleBuilder', () => {
  it('renders one row per rule', () => {
    render(<RuleBuilder rules={[{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }]} onChange={() => {}} />);
    expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
  });

  it('adds a new empty rule when Add rule is clicked', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add rule'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: [] }]);
  });

  it('removes a rule when its remove button is clicked', () => {
    const onChange = vi.fn();
    const rules = [
      { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
      { apiGroups: [''], resources: ['services'], verbs: ['list'] },
    ];
    render(<RuleBuilder rules={rules} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('remove-rule-0'));
    expect(onChange).toHaveBeenCalledWith([rules[1]]);
  });

  it('adds a custom verb typed into the free-text field on Enter', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} />);
    const input = screen.getByLabelText('custom-verbs');
    fireEvent.change(input, { target: { value: 'watch' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['watch'] }]);
  });

  it('adds a verb selected from the discovery options dropdown', () => {
    const onChange = vi.fn();
    render(
      <RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} verbOptions={['get', 'list']} />,
    );
    fireEvent.change(screen.getByLabelText('add-verbs'), { target: { value: 'get' } });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['get'] }]);
  });

  it('removes a value when its remove button is clicked', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: ['get', 'list'] }]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('remove-verbs-get'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['list'] }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- RuleBuilder`
Expected: FAIL — module `./RuleBuilder` does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/components/RuleBuilder.tsx
import { useState } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { PolicyRule } from '../types/rbac';

interface RuleBuilderProps {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
  resourceOptions?: string[];
  groupOptions?: string[];
  verbOptions?: string[];
}

interface ChipMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}

function ChipMultiSelect({ label, values, options, onChange }: ChipMultiSelectProps) {
  const [pending, setPending] = useState('');

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setPending('');
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div data-testid={`multiselect-${label}`}>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <span key={value} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0 0.25rem' }}>
            {value}
            <button type="button" aria-label={`remove-${label}-${value}`} onClick={() => removeValue(value)}>
              &times;
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {options.length > 0 && (
          <FormSelect aria-label={`add-${label}`} value="" onChange={(_e, value) => addValue(value)}>
            <FormSelectOption key="" value="" label={`Add ${label}...`} />
            {options.filter((o) => !values.includes(o)).map((option) => (
              <FormSelectOption key={option} value={option} label={option} />
            ))}
          </FormSelect>
        )}
        <TextInput
          aria-label={`custom-${label}`}
          placeholder={`Custom ${label}`}
          value={pending}
          onChange={(_e, value) => setPending(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue(pending);
            }
          }}
        />
        <Button variant="plain" aria-label={`add-custom-${label}`} onClick={() => addValue(pending)}>
          <PlusCircleIcon />
        </Button>
      </div>
    </div>
  );
}

export function RuleBuilder({ rules, onChange, resourceOptions = [], groupOptions = [], verbOptions = [] }: RuleBuilderProps) {
  const updateRule = (index: number, field: keyof PolicyRule, values: string[]) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, [field]: values } : rule)));
  };

  const addRule = () => {
    onChange([...rules, { apiGroups: [], resources: [], verbs: [] }]);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="rule-builder">
      {rules.map((rule, index) => (
        <div key={index} data-testid={`rule-row-${index}`} style={{ border: '1px solid #ccc', padding: '0.5rem', marginBottom: '0.5rem' }}>
          <ChipMultiSelect label="apiGroups" values={rule.apiGroups} options={groupOptions} onChange={(v) => updateRule(index, 'apiGroups', v)} />
          <ChipMultiSelect label="resources" values={rule.resources} options={resourceOptions} onChange={(v) => updateRule(index, 'resources', v)} />
          <ChipMultiSelect label="verbs" values={rule.verbs} options={verbOptions} onChange={(v) => updateRule(index, 'verbs', v)} />
          <Button variant="plain" aria-label={`remove-rule-${index}`} onClick={() => removeRule(index)}>
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addRule}>
        Add rule
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- RuleBuilder`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RuleBuilder.tsx frontend/src/components/RuleBuilder.test.tsx
git commit -m "Add RuleBuilder component with discovery-backed and free-text value entry"
```

---

### Task 15: SubjectBuilder component

**Files:**
- Create: `frontend/src/components/SubjectBuilder.tsx`
- Create: `frontend/src/components/SubjectBuilder.test.tsx`

**Interfaces:**
- Consumes: `Subject` (Task 12).
- Produces: `SubjectBuilder({ subjects, onChange, serviceAccounts })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/SubjectBuilder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubjectBuilder } from './SubjectBuilder';

describe('SubjectBuilder', () => {
  it('renders one row per subject', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByTestId('subject-row-0')).toBeInTheDocument();
  });

  it('adds a new ServiceAccount subject when Add subject is clicked', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[]} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.click(screen.getByText('Add subject'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'ServiceAccount', name: '' }]);
  });

  it('removes a subject when its remove button is clicked', () => {
    const onChange = vi.fn();
    const subjects = [{ kind: 'User' as const, name: 'alice' }, { kind: 'Group' as const, name: 'admins' }];
    render(<SubjectBuilder subjects={subjects} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.click(screen.getByLabelText('remove-subject-0'));
    expect(onChange).toHaveBeenCalledWith([subjects[1]]);
  });

  it('shows a ServiceAccount dropdown populated from the serviceAccounts prop', () => {
    render(<SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={() => {}} serviceAccounts={['builder']} />);
    expect(screen.getByRole('option', { name: 'builder' })).toBeInTheDocument();
  });

  it('shows a free-text field for User subjects', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByLabelText('subject-name-0')).toHaveValue('alice');
  });

  it('updates the subject kind when changed', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.change(screen.getByLabelText('subject-kind-0'), { target: { value: 'Group' } });
    expect(onChange).toHaveBeenCalledWith([{ kind: 'Group', name: 'alice' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- SubjectBuilder`
Expected: FAIL — module `./SubjectBuilder` does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/components/SubjectBuilder.tsx
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { Subject } from '../types/rbac';

interface SubjectBuilderProps {
  subjects: Subject[];
  onChange: (subjects: Subject[]) => void;
  serviceAccounts: string[];
}

const KIND_OPTIONS: Subject['kind'][] = ['ServiceAccount', 'User', 'Group'];

export function SubjectBuilder({ subjects, onChange, serviceAccounts }: SubjectBuilderProps) {
  const updateSubject = (index: number, field: keyof Subject, value: string) => {
    onChange(subjects.map((subject, i) => (i === index ? { ...subject, [field]: value } : subject)));
  };

  const addSubject = () => {
    onChange([...subjects, { kind: 'ServiceAccount', name: '' }]);
  };

  const removeSubject = (index: number) => {
    onChange(subjects.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="subject-builder">
      {subjects.map((subject, index) => (
        <div key={index} data-testid={`subject-row-${index}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <FormSelect aria-label={`subject-kind-${index}`} value={subject.kind} onChange={(_e, value) => updateSubject(index, 'kind', value)}>
            {KIND_OPTIONS.map((kind) => (
              <FormSelectOption key={kind} value={kind} label={kind} />
            ))}
          </FormSelect>
          {subject.kind === 'ServiceAccount' ? (
            <FormSelect aria-label={`subject-name-${index}`} value={subject.name} onChange={(_e, value) => updateSubject(index, 'name', value)}>
              <FormSelectOption key="" value="" label="Select a ServiceAccount" />
              {serviceAccounts.map((sa) => (
                <FormSelectOption key={sa} value={sa} label={sa} />
              ))}
            </FormSelect>
          ) : (
            <TextInput
              aria-label={`subject-name-${index}`}
              value={subject.name}
              onChange={(_e, value) => updateSubject(index, 'name', value)}
              placeholder="Name"
            />
          )}
          <Button variant="plain" aria-label={`remove-subject-${index}`} onClick={() => removeSubject(index)}>
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addSubject}>
        Add subject
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- SubjectBuilder`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SubjectBuilder.tsx frontend/src/components/SubjectBuilder.test.tsx
git commit -m "Add SubjectBuilder component"
```

---

### Task 16: YamlToggle component (Form ⇄ YAML sync)

**Files:**
- Create: `frontend/src/components/YamlToggle.tsx`
- Create: `frontend/src/components/YamlToggle.test.tsx`

**Interfaces:**
- Consumes: `toYaml`, `fromYaml` (Task 12).
- Produces: `YamlToggle<T>({ value, onChange, kind, renderForm })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/YamlToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { YamlToggle } from './YamlToggle';

vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditor: ({ code, onChange }: { code: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-code-editor" value={code} onChange={(e) => onChange(e.target.value)} />
  ),
  Language: { yaml: 'yaml' },
}));

describe('YamlToggle', () => {
  it('renders the form by default', () => {
    render(<YamlToggle value={{ name: 'reader' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
  });

  it('switches to the YAML editor when YAML is clicked', () => {
    render(<YamlToggle value={{ name: 'reader' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('form-view')).not.toBeInTheDocument();
  });

  it('parses valid YAML back into the form value on toggle to Form', () => {
    const onChange = vi.fn();
    render(<YamlToggle value={{ name: 'reader' }} onChange={onChange} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: updated\n' } });
    fireEvent.click(screen.getByText('Form'));
    expect(onChange).toHaveBeenCalledWith({ name: 'updated' });
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
  });

  it('shows an error and stays in YAML mode when the YAML is invalid', () => {
    const onChange = vi.fn();
    render(<YamlToggle value={{ name: 'reader' }} onChange={onChange} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'kind: ClusterRole\nname: updated\n' } });
    fireEvent.click(screen.getByText('Form'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Expected kind "Role", got "ClusterRole"');
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- YamlToggle`
Expected: FAIL — module `./YamlToggle` does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// frontend/src/components/YamlToggle.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { toYaml, fromYaml } from '../lib/yamlSync';

interface YamlToggleProps<T> {
  value: T;
  onChange: (value: T) => void;
  kind: string;
  renderForm: () => ReactNode;
}

export function YamlToggle<T>({ value, onChange, kind, renderForm }: YamlToggleProps<T>) {
  const [mode, setMode] = useState<'form' | 'yaml'>('form');
  const [yamlText, setYamlText] = useState(() => toYaml(value));
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (target: 'form' | 'yaml') => {
    if (target === mode) return;
    if (target === 'yaml') {
      setYamlText(toYaml(value));
      setError(null);
      setMode('yaml');
      return;
    }
    try {
      const parsed = fromYaml<T>(yamlText, kind);
      onChange(parsed);
      setError(null);
      setMode('form');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid YAML');
    }
  };

  return (
    <div data-testid="yaml-toggle">
      <ToggleGroup aria-label="Form or YAML view">
        <ToggleGroupItem text="Form" isSelected={mode === 'form'} onChange={() => handleToggle('form')} />
        <ToggleGroupItem text="YAML" isSelected={mode === 'yaml'} onChange={() => handleToggle('yaml')} />
      </ToggleGroup>
      {error && <div role="alert">{error}</div>}
      {mode === 'form' ? (
        renderForm()
      ) : (
        <CodeEditor code={yamlText} language={Language.yaml} onChange={(code) => setYamlText(code)} height="400px" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- YamlToggle`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/YamlToggle.tsx frontend/src/components/YamlToggle.test.tsx
git commit -m "Add Form-YAML toggle component with kind-validated round trip"
```

---

### Task 17: Login page

**Files:**
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: `login` (Task 13).
- Produces: `LoginPageContainer({ onLoggedIn })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/Login.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPageContainer } from './Login';
import * as api from '../api/client';

vi.mock('../api/client');

describe('LoginPageContainer', () => {
  it('calls onLoggedIn after a successful login', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({ authenticated: true });
    const onLoggedIn = vi.fn();
    render(<LoginPageContainer onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
    expect(api.login).toHaveBeenCalledWith('admin', 's3cret');
  });

  it('shows an error message when login fails', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('invalid credentials'));
    render(<LoginPageContainer onLoggedIn={() => {}} />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(screen.getByText('invalid credentials')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- Login`
Expected: FAIL — module `./Login` does not exist.

- [ ] **Step 3: Implement the page**

```tsx
// frontend/src/pages/Login.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { LoginPage, LoginForm } from '@patternfly/react-core';
import { login } from '../api/client';

interface LoginPageContainerProps {
  onLoggedIn: () => void;
}

export function LoginPageContainer({ onLoggedIn }: LoginPageContainerProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LoginPage loginTitle="Log in to rbac-generator" textContent="Build and apply Kubernetes RBAC resources.">
      <LoginForm
        usernameLabel="Username"
        passwordLabel="Password"
        usernameValue={username}
        passwordValue={password}
        onChangeUsername={(_e, value) => setUsername(value)}
        onChangePassword={(_e, value) => setPassword(value)}
        onLoginButtonClick={handleSubmit}
        isLoginButtonDisabled={submitting}
        loginButtonLabel={submitting ? 'Logging in...' : 'Log in'}
        helperText={error ?? undefined}
        showHelperText={Boolean(error)}
      />
    </LoginPage>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- Login`
Expected: PASS. If PatternFly's `LoginForm` prop names differ slightly from those used above in the installed `@patternfly/react-core@6` version, check `node_modules/@patternfly/react-core/dist/esm/components/LoginPage/LoginForm.d.ts` and adjust the prop names to match (the behavior — controlled username/password, a submit handler, and error text — stays the same).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/pages/Login.test.tsx
git commit -m "Add PatternFly6 login page"
```

---

### Task 18: Connection page

**Files:**
- Create: `frontend/src/pages/Connection.tsx`
- Create: `frontend/src/pages/Connection.test.tsx`

**Interfaces:**
- Consumes: `connect`, `disconnect` (Task 13), `ClusterInfo` (Task 12).
- Produces: `ConnectionPage({ clusterInfo, onConnected, onDisconnected })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/Connection.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionPage } from './Connection';
import * as api from '../api/client';

vi.mock('../api/client');

describe('ConnectionPage', () => {
  it('shows the connect form when there is no cluster info', () => {
    render(<ConnectionPage onConnected={() => {}} onDisconnected={() => {}} />);
    expect(screen.getByText('Connect to a cluster')).toBeInTheDocument();
  });

  it('shows connected details and a Disconnect button when cluster info is provided', () => {
    render(
      <ConnectionPage
        clusterInfo={{ server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' }}
        onConnected={() => {}}
        onDisconnected={() => {}}
      />,
    );
    expect(screen.getByText('https://x:6443')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('calls onConnected with the response after a successful connect', async () => {
    const info = { server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' };
    vi.spyOn(api, 'connect').mockResolvedValue(info);
    const onConnected = vi.fn();
    render(<ConnectionPage onConnected={onConnected} onDisconnected={() => {}} />);

    fireEvent.change(screen.getByLabelText('kubeconfig-text'), { target: { value: 'apiVersion: v1' } });
    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(info));
  });

  it('calls onDisconnected after clicking Disconnect', async () => {
    vi.spyOn(api, 'disconnect').mockResolvedValue(undefined);
    const onDisconnected = vi.fn();
    render(
      <ConnectionPage
        clusterInfo={{ server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' }}
        onConnected={() => {}}
        onDisconnected={onDisconnected}
      />,
    );

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => expect(onDisconnected).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- Connection`
Expected: FAIL — module `./Connection` does not exist.

- [ ] **Step 3: Implement the page**

```tsx
// frontend/src/pages/Connection.tsx
import { useState } from 'react';
import { ActionGroup, Alert, Button, Card, CardBody, CardTitle, Form, FormGroup, TextArea } from '@patternfly/react-core';
import { connect, disconnect } from '../api/client';
import type { ClusterInfo } from '../types/rbac';

interface ConnectionPageProps {
  clusterInfo?: ClusterInfo;
  onConnected: (info: ClusterInfo) => void;
  onDisconnected: () => void;
}

export function ConnectionPage({ clusterInfo, onConnected, onDisconnected }: ConnectionPageProps) {
  const [kubeconfig, setKubeconfig] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleConnect = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const info = await connect(kubeconfig);
      onConnected(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnected();
  };

  if (clusterInfo) {
    return (
      <Card>
        <CardTitle>Connected</CardTitle>
        <CardBody>
          <p>{clusterInfo.server}</p>
          <p>Version: {clusterInfo.version}</p>
          <p>Context: {clusterInfo.currentContext}</p>
          <Button variant="danger" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Connect to a cluster</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title={error} />}
        <Form>
          <FormGroup label="Kubeconfig" fieldId="kubeconfig">
            <TextArea
              id="kubeconfig"
              aria-label="kubeconfig-text"
              value={kubeconfig}
              onChange={(_e, value) => setKubeconfig(value)}
              rows={10}
              placeholder="Paste your kubeconfig YAML here"
            />
          </FormGroup>
          <ActionGroup>
            <Button variant="primary" onClick={handleConnect} isDisabled={submitting || !kubeconfig.trim()}>
              Connect
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- Connection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Connection.tsx frontend/src/pages/Connection.test.tsx
git commit -m "Add cluster connection page"
```

---

### Task 19: Create page

**Files:**
- Create: `frontend/src/pages/Create.tsx`
- Create: `frontend/src/pages/Create.test.tsx`

**Interfaces:**
- Consumes: `RuleBuilder` (Task 14), `SubjectBuilder` (Task 15), `YamlToggle` (Task 16), `dryRun`/`createResource`/`getDiscoveryResources`/`getServiceAccounts` (Task 13), `isNamespaced`/`requiresRules`/`requiresSubjects` (Task 12).
- Produces: `CreatePage({ connected })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/Create.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreatePage } from './Create';
import * as api from '../api/client';

vi.mock('../api/client');

describe('CreatePage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: ['get', 'list'] });
  });

  it('disables Dry-Run and Apply when not connected', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByText('Preview & Dry-Run').closest('button')).toBeDisabled();
    expect(screen.getByText('Apply').closest('button')).toBeDisabled();
  });

  it('enables Apply only after a successful dry-run', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    render(<CreatePage connected />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'reader' } });
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'default' } });
    fireEvent.click(screen.getByText('Preview & Dry-Run'));

    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());
    expect(api.dryRun).toHaveBeenCalledWith('roles', expect.objectContaining({ name: 'reader', namespace: 'default' }));
  });

  it('calls createResource with the built resource on Apply', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    vi.spyOn(api, 'createResource').mockResolvedValue({});
    render(<CreatePage connected />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'reader' } });
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'default' } });
    fireEvent.click(screen.getByText('Preview & Dry-Run'));
    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());

    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() =>
      expect(api.createResource).toHaveBeenCalledWith('roles', expect.objectContaining({ name: 'reader', namespace: 'default' })),
    );
  });

  it('shows the SubjectBuilder and hides RuleBuilder when switching to ClusterRoleBinding', () => {
    render(<CreatePage connected />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'clusterrolebindings' } });
    expect(screen.queryByTestId('rule-builder')).not.toBeInTheDocument();
    expect(screen.getByTestId('subject-builder')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- Create`
Expected: FAIL — module `./Create` does not exist.

- [ ] **Step 3: Implement the page**

```tsx
// frontend/src/pages/Create.tsx
import { useEffect, useState } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalVariant,
  TextInput,
} from '@patternfly/react-core';
import { RuleBuilder } from '../components/RuleBuilder';
import { SubjectBuilder } from '../components/SubjectBuilder';
import { YamlToggle } from '../components/YamlToggle';
import { createResource, dryRun, getDiscoveryResources, getServiceAccounts } from '../api/client';
import { isNamespaced, requiresRules, requiresSubjects } from '../types/rbac';
import type { Kind, RbacResource } from '../types/rbac';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'roles', label: 'Role' },
  { value: 'clusterroles', label: 'ClusterRole' },
  { value: 'rolebindings', label: 'RoleBinding' },
  { value: 'clusterrolebindings', label: 'ClusterRoleBinding' },
];

interface CreatePageProps {
  connected: boolean;
}

export function CreatePage({ connected }: CreatePageProps) {
  const [kind, setKind] = useState<Kind>('roles');
  const [resource, setResource] = useState<RbacResource>({ name: '' });
  const [catalog, setCatalog] = useState<{ groups: string[]; resources: string[]; verbs: string[] }>({
    groups: [],
    resources: [],
    verbs: [],
  });
  const [serviceAccounts, setServiceAccounts] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ result?: unknown; error?: string } | null>(null);
  const [dryRunPassed, setDryRunPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiscoveryResources()
      .then((data) => {
        setCatalog({
          groups: Array.from(new Set(data.resources.map((r) => r.group))).sort(),
          resources: Array.from(new Set(data.resources.map((r) => r.resource))).sort(),
          verbs: data.verbs,
        });
      })
      .catch(() => undefined);
  }, [connected]);

  useEffect(() => {
    if (connected && resource.namespace && kind === 'rolebindings') {
      getServiceAccounts(resource.namespace).then(setServiceAccounts).catch(() => setServiceAccounts([]));
    }
  }, [connected, resource.namespace, kind]);

  const handleKindChange = (value: string) => {
    setKind(value as Kind);
    setResource({ name: resource.name });
    setDryRunPassed(false);
    setPreview(null);
  };

  const updateField = <K extends keyof RbacResource>(field: K, fieldValue: RbacResource[K]) => {
    setResource((prev) => ({ ...prev, [field]: fieldValue }));
    setDryRunPassed(false);
  };

  const handleDryRun = async () => {
    setError(null);
    try {
      const result = await dryRun(kind, resource);
      setPreview({ result });
      setDryRunPassed(true);
    } catch (e) {
      setPreview({ error: e instanceof Error ? e.message : 'Dry-run failed' });
      setDryRunPassed(false);
    }
  };

  const handleApply = async () => {
    setError(null);
    try {
      await createResource(kind, resource);
      setPreview(null);
      setDryRunPassed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(resource, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.name || 'resource'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFields = () => (
    <>
      <FormGroup label="Name" fieldId="name" isRequired>
        <TextInput id="name" value={resource.name} onChange={(_e, value) => updateField('name', value)} isRequired />
      </FormGroup>
      {isNamespaced(kind) && (
        <FormGroup label="Namespace" fieldId="namespace" isRequired>
          <TextInput id="namespace" value={resource.namespace ?? ''} onChange={(_e, value) => updateField('namespace', value)} isRequired />
        </FormGroup>
      )}
      {requiresSubjects(kind) && (
        <FormGroup label="Role reference name" fieldId="roleRefName" isRequired>
          <TextInput
            id="roleRefName"
            value={resource.roleRef?.name ?? ''}
            onChange={(_e, value) => updateField('roleRef', { kind: kind === 'rolebindings' ? 'Role' : 'ClusterRole', name: value })}
            isRequired
          />
        </FormGroup>
      )}
      {requiresRules(kind) && (
        <RuleBuilder
          rules={resource.rules ?? []}
          onChange={(rules) => updateField('rules', rules)}
          groupOptions={catalog.groups}
          resourceOptions={catalog.resources}
          verbOptions={catalog.verbs}
        />
      )}
      {requiresSubjects(kind) && (
        <SubjectBuilder subjects={resource.subjects ?? []} onChange={(subjects) => updateField('subjects', subjects)} serviceAccounts={serviceAccounts} />
      )}
    </>
  );

  return (
    <Card>
      <CardBody>
        {error && <Alert variant="danger" title={error} />}
        <Form>
          <FormGroup label="Kind" fieldId="kind">
            <FormSelect id="kind" value={kind} onChange={(_e, value) => handleKindChange(value)}>
              {KIND_OPTIONS.map((opt) => (
                <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </FormSelect>
          </FormGroup>
          <YamlToggle value={resource} onChange={setResource} kind={kind} renderForm={renderFields} />
          <ActionGroup>
            <Button variant="secondary" onClick={handleDryRun} isDisabled={!connected}>
              Preview &amp; Dry-Run
            </Button>
            <Button variant="primary" onClick={handleApply} isDisabled={!connected || !dryRunPassed}>
              Apply
            </Button>
            <Button variant="link" onClick={handleDownload}>
              Download YAML
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
      {preview && (
        <Modal variant={ModalVariant.medium} title="Preview" isOpen onClose={() => setPreview(null)}>
          <pre>{JSON.stringify(preview.result ?? { error: preview.error }, null, 2)}</pre>
        </Modal>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- Create`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Create.tsx frontend/src/pages/Create.test.tsx
git commit -m "Add Create page wiring kind selector, builders, YAML toggle, dry-run and apply"
```

---

### Task 20: Browse page

**Files:**
- Create: `frontend/src/pages/Browse.tsx`
- Create: `frontend/src/pages/Browse.test.tsx`

**Interfaces:**
- Consumes: `listResources`, `getResource` (Task 13), `isNamespaced` (Task 12).
- Produces: `BrowsePage({ connected })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/Browse.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowsePage } from './Browse';
import * as api from '../api/client';

vi.mock('../api/client');

describe('BrowsePage', () => {
  it('lists resources for the selected kind', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    render(<BrowsePage connected />);
    await waitFor(() => expect(screen.getByText('reader')).toBeInTheDocument());
    expect(api.listResources).toHaveBeenCalledWith('roles', undefined);
  });

  it('shows resource YAML in the drawer when a row is clicked', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    vi.spyOn(api, 'getResource').mockResolvedValue({ name: 'reader', namespace: 'default', rules: [] });
    render(<BrowsePage connected />);
    await waitFor(() => screen.getByText('reader'));

    fireEvent.click(screen.getByText('reader'));

    await waitFor(() => expect(screen.getByTestId('yaml-drawer')).toBeInTheDocument());
    expect(api.getResource).toHaveBeenCalledWith('roles', 'reader', 'default');
  });

  it('does not fetch a list when not connected', () => {
    render(<BrowsePage connected={false} />);
    expect(api.listResources).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- Browse`
Expected: FAIL — module `./Browse` does not exist.

- [ ] **Step 3: Implement the page**

```tsx
// frontend/src/pages/Browse.tsx
import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerContentBody, DrawerPanelContent, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import yaml from 'js-yaml';
import { getResource, listResources } from '../api/client';
import { isNamespaced } from '../types/rbac';
import type { Kind, RbacResource } from '../types/rbac';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'roles', label: 'Role' },
  { value: 'clusterroles', label: 'ClusterRole' },
  { value: 'rolebindings', label: 'RoleBinding' },
  { value: 'clusterrolebindings', label: 'ClusterRoleBinding' },
];

interface BrowsePageProps {
  connected: boolean;
}

export function BrowsePage({ connected }: BrowsePageProps) {
  const [kind, setKind] = useState<Kind>('roles');
  const [namespace, setNamespace] = useState('');
  const [items, setItems] = useState<RbacResource[]>([]);
  const [selected, setSelected] = useState<RbacResource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setItems([]);
      return;
    }
    listResources(kind, isNamespaced(kind) ? namespace || undefined : undefined)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load resources'));
  }, [connected, kind, namespace]);

  const openDetail = async (item: RbacResource) => {
    try {
      const full = await getResource(kind, item.name, item.namespace);
      setSelected(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resource');
    }
  };

  const panel = <DrawerPanelContent>{selected && <pre data-testid="yaml-drawer">{yaml.dump(selected)}</pre>}</DrawerPanelContent>;

  return (
    <Drawer isExpanded={Boolean(selected)} onExpand={() => undefined}>
      <DrawerContent panelContent={panel}>
        <DrawerContentBody>
          {error && <div role="alert">{error}</div>}
          <FormSelect aria-label="Kind filter" value={kind} onChange={(_e, value) => setKind(value as Kind)}>
            {KIND_OPTIONS.map((opt) => (
              <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </FormSelect>
          {isNamespaced(kind) && (
            <TextInput aria-label="Namespace filter" placeholder="Filter by namespace" value={namespace} onChange={(_e, value) => setNamespace(value)} />
          )}
          <Table aria-label="RBAC resources">
            <Thead>
              <Tr>
                <Th>Name</Th>
                {isNamespaced(kind) && <Th>Namespace</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr key={`${item.namespace ?? ''}/${item.name}`} onClick={() => openDetail(item)} style={{ cursor: 'pointer' }}>
                  <Td>{item.name}</Td>
                  {isNamespaced(kind) && <Td>{item.namespace}</Td>}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- Browse`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Browse.tsx frontend/src/pages/Browse.test.tsx
git commit -m "Add read-only Browse page with resource list and YAML detail drawer"
```

---

### Task 21: App shell (routing, sidebar nav, session bootstrap)

**Files:**
- Modify: `frontend/src/App.tsx` (full rewrite)
- Modify: `frontend/src/App.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `LoginPageContainer` (Task 17), `ConnectionPage` (Task 18), `CreatePage` (Task 19), `BrowsePage` (Task 20), `getSession`/`logout` (Task 13).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/App.test.tsx (full replacement)
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as api from './api/client';

vi.mock('./api/client');

describe('App', () => {
  it('shows the login page when the session is unauthenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: false, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log in to rbac-generator')).toBeInTheDocument());
  });

  it('shows the app shell when the session is authenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('rbac-generator')).toBeInTheDocument());
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
  });

  it('switches views when a nav item is clicked', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: [] });
    render(<App />);
    await waitFor(() => screen.getByText('Create'));
    fireEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Preview & Dry-Run')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL — the placeholder `App` from Task 11 doesn't render a login page or nav items.

- [ ] **Step 3: Implement the app shell**

```tsx
// frontend/src/App.tsx (full replacement)
import { useEffect, useState } from 'react';
import { Masthead, MastheadBrand, MastheadMain, Nav, NavItem, NavList, Page, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { LoginPageContainer } from './pages/Login';
import { ConnectionPage } from './pages/Connection';
import { CreatePage } from './pages/Create';
import { BrowsePage } from './pages/Browse';
import { getSession, logout } from './api/client';
import type { ClusterInfo } from './types/rbac';

type View = 'connection' | 'create' | 'browse';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | undefined>(undefined);
  const [view, setView] = useState<View>('connection');

  useEffect(() => {
    getSession()
      .then((info) => {
        setAuthenticated(info.authenticated);
        setClusterInfo(info.clusterInfo);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return null;
  }

  if (!authenticated) {
    return <LoginPageContainer onLoggedIn={() => setAuthenticated(true)} />;
  }

  const handleLogout = async () => {
    await logout();
    setAuthenticated(false);
    setClusterInfo(undefined);
  };

  const sidebar = (
    <PageSidebar>
      <PageSidebarBody>
        <Nav>
          <NavList>
            <NavItem isActive={view === 'connection'} onClick={() => setView('connection')}>
              Connection
            </NavItem>
            <NavItem isActive={view === 'create'} onClick={() => setView('create')}>
              Create
            </NavItem>
            <NavItem isActive={view === 'browse'} onClick={() => setView('browse')}>
              Browse
            </NavItem>
            <NavItem onClick={handleLogout}>Log out</NavItem>
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>rbac-generator</MastheadBrand>
      </MastheadMain>
    </Masthead>
  );

  return (
    <Page sidebar={sidebar} masthead={masthead}>
      {view === 'connection' && (
        <ConnectionPage clusterInfo={clusterInfo} onConnected={(info) => setClusterInfo(info)} onDisconnected={() => setClusterInfo(undefined)} />
      )}
      {view === 'create' && <CreatePage connected={Boolean(clusterInfo)} />}
      {view === 'browse' && <BrowsePage connected={Boolean(clusterInfo)} />}
    </Page>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- App`
Expected: PASS

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Verify the production build still works**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Add app shell with session bootstrap, sidebar nav, and view routing"
```

---

## Container & Deployment

### Task 22: Multi-stage Containerfile using Red Hat UBI9 images

**Files:**
- Create: `Containerfile`
- Modify: `Makefile` (already has an `image` target from Task 1 — verify it still matches)
- Modify: `.gitignore` (already covers `backend/bin/`, `frontend/dist/`, `frontend/node_modules/` from Task 1)

**Interfaces:**
- Produces: a runnable `rbac-generator:latest` image exposing port 8080.

- [ ] **Step 1: Write the Containerfile**

```dockerfile
# Containerfile

# Stage 1: build the frontend
FROM registry.access.redhat.com/ubi9/nodejs-22 AS frontend-build
WORKDIR /opt/app-root/src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the Go backend, embedding the frontend build output
FROM registry.access.redhat.com/ubi9/go-toolset AS backend-build
WORKDIR /opt/app-root/src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend-build /opt/app-root/src/dist/ ./internal/httpapi/static/dist/
ENV CGO_ENABLED=0
RUN go build -o /opt/app-root/src/bin/rbac-generator ./cmd/server

# Stage 3: minimal runtime — just the static binary
FROM registry.access.redhat.com/ubi9/ubi-micro
COPY --from=backend-build /opt/app-root/src/bin/rbac-generator /usr/bin/rbac-generator
EXPOSE 8080
USER 1001
ENTRYPOINT ["/usr/bin/rbac-generator"]
```

- [ ] **Step 2: Build the image locally**

Run:
```bash
podman build -t rbac-generator:latest -f Containerfile .
```
Expected: builds successfully through all three stages.

- [ ] **Step 3: Smoke-test the running container**

Run:
```bash
HASH=$(podman run --rm registry.access.redhat.com/ubi9/go-toolset:latest true 2>/dev/null; cd backend && go run ./cmd/hashpw "s3cret")
podman run --rm -p 8080:8080 -e APP_USERNAME=admin -e APP_PASSWORD_HASH="$HASH" rbac-generator:latest &
sleep 2
curl -sf http://localhost:8080/healthz
kill %1
```
Expected: `curl` prints `ok` with exit code 0.

- [ ] **Step 4: Commit**

```bash
git add Containerfile
git commit -m "Add multi-stage Containerfile using Red Hat UBI9 images for every build stage"
```

---

### Task 23: Kustomize deployment manifests

**Files:**
- Create: `deploy/kustomize/base/deployment.yaml`
- Create: `deploy/kustomize/base/service.yaml`
- Create: `deploy/kustomize/base/route.yaml`
- Create: `deploy/kustomize/base/secret.example.yaml`
- Create: `deploy/kustomize/base/kustomization.yaml`

**Interfaces:**
- Produces: a deployable base that assumes a `rbac-generator-credentials` Secret exists with `APP_USERNAME`/`APP_PASSWORD_HASH` keys.

- [ ] **Step 1: Write the Deployment**

```yaml
# deploy/kustomize/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rbac-generator
  labels:
    app: rbac-generator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rbac-generator
  template:
    metadata:
      labels:
        app: rbac-generator
    spec:
      containers:
        - name: rbac-generator
          image: rbac-generator:latest
          ports:
            - containerPort: 8080
          env:
            - name: PORT
              value: "8080"
            - name: APP_USERNAME
              valueFrom:
                secretKeyRef:
                  name: rbac-generator-credentials
                  key: APP_USERNAME
            - name: APP_PASSWORD_HASH
              valueFrom:
                secretKeyRef:
                  name: rbac-generator-credentials
                  key: APP_PASSWORD_HASH
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 2
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 20
```

- [ ] **Step 2: Write the Service**

```yaml
# deploy/kustomize/base/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: rbac-generator
  labels:
    app: rbac-generator
spec:
  selector:
    app: rbac-generator
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

- [ ] **Step 3: Write the OpenShift Route**

```yaml
# deploy/kustomize/base/route.yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: rbac-generator
  labels:
    app: rbac-generator
spec:
  to:
    kind: Service
    name: rbac-generator
  port:
    targetPort: http
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

- [ ] **Step 4: Write the Secret example (template only, not real credentials)**

```yaml
# deploy/kustomize/base/secret.example.yaml
apiVersion: v1
kind: Secret
metadata:
  name: rbac-generator-credentials
type: Opaque
stringData:
  APP_USERNAME: admin
  APP_PASSWORD_HASH: "REPLACE_WITH_OUTPUT_OF_make_hash-password_PASSWORD=yourpassword"
```

- [ ] **Step 5: Write the kustomization**

```yaml
# deploy/kustomize/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
  - route.yaml
```

Note: `secret.example.yaml` is intentionally excluded from `resources` — it is a template for the user to copy to a real (gitignored) `secret.yaml` with actual credentials and apply/reference separately, never committed with real values.

- [ ] **Step 6: Validate the kustomize build**

Run: `kubectl kustomize deploy/kustomize/base`
Expected: prints the rendered Deployment, Service, and Route YAML with no errors.

- [ ] **Step 7: Commit**

```bash
git add deploy
git commit -m "Add kustomize base manifests for Deployment, Service, Route, and Secret template"
```

---

### Task 24: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# rbac-generator

A self-contained web app for building Kubernetes/OpenShift `Role`, `ClusterRole`,
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
make test
```

## Building the container image

```bash
make image
```

This builds `rbac-generator:latest` using a multi-stage `Containerfile` where
every stage is a Red Hat UBI9 image:

- `registry.access.redhat.com/ubi9/nodejs-22` — builds the frontend.
- `registry.access.redhat.com/ubi9/go-toolset` — builds the Go backend and embeds
  the frontend build output via `go:embed`.
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

1. Copy `deploy/kustomize/base/secret.example.yaml` to a local, gitignored
   `secret.yaml` and fill in real values (`APP_PASSWORD_HASH` from
   `make hash-password`).
2. Apply the secret: `kubectl apply -f secret.yaml`
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-29-rbac-generator-design.md` maps to a task — architecture/session (Tasks 2–4), auth/login UI (Tasks 3, 17), cluster connection (Tasks 5–6, 18), discovery (Task 7), builders/handlers for the 4 kinds (Tasks 8–9), embedding (Task 10), Form⇄YAML toggle (Task 16), Create/Browse UX (Tasks 14, 15, 19, 20), app shell/nav (Task 21), Red Hat UBI9 container build (Task 22), kustomize manifests (Task 23), README (Task 24).
- **Placeholder scan:** no TBD/TODO markers; every step includes complete, runnable code or exact commands.
- **Type consistency:** `CreateRequest`/`PolicyRuleInput`/`SubjectInput`/`RoleRefInput` (Task 8) are used with identical field names in the handlers (Task 9) and mirrored 1:1 by the frontend's `RbacResource`/`PolicyRule`/`Subject`/`RoleRef` (Task 12) and the API client (Task 13). `session.Session{Clientset, ClusterInfo}` (Task 2) is the single type used by `auth` (Task 3), `connection` (Task 6), `discovery` (Task 7), and `rbac` (Task 9) handlers. `httpapi.Deps` grows additively across Tasks 4, 6, 7, 9 without renaming existing fields.
