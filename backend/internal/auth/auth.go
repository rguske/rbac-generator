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
