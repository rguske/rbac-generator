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
