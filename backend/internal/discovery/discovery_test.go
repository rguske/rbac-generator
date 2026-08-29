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
