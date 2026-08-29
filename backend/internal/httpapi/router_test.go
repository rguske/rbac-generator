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
