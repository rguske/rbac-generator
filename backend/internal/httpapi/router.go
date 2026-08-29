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
