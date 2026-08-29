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

func TestSessionInfo_ClusterInfoUsesCamelCaseJSON(t *testing.T) {
	// Regression test: session.ClusterInfo previously had no JSON tags, so
	// Go's case-insensitive Unmarshal masked the bug in Go-only tests, but
	// the wire format sent to the (case-sensitive) frontend was PascalCase
	// ("Server"/"Version"/"CurrentContext") instead of the camelCase the
	// frontend's ClusterInfo type expects (frontend/src/types/rbac.ts).
	h, store := newTestHandler(t)
	sess := store.Create()
	sess.Authenticated = true
	sess.ClusterInfo = &session.ClusterInfo{Server: "https://cluster.example", Version: "v1.30.0", CurrentContext: "my-context"}

	req := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: sess.ID})
	rec := httptest.NewRecorder()

	h.SessionInfo(rec, req)

	var raw map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("decode raw response: %v", err)
	}
	clusterInfo, ok := raw["clusterInfo"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a clusterInfo object in response, got: %#v", raw)
	}
	for _, field := range []string{"server", "version", "currentContext"} {
		if _, ok := clusterInfo[field]; !ok {
			t.Errorf("expected camelCase field %q in clusterInfo, got: %#v", field, clusterInfo)
		}
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
