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
