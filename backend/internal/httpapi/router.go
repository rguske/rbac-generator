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
