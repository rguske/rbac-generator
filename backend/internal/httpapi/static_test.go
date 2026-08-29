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
