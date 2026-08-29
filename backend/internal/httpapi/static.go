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
