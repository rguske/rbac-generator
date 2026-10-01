// backend/internal/discovery/identity_test.go
package discovery

import (
	"net/http"
	"net/http/httptest"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	clienttesting "k8s.io/client-go/testing"

	"rbac-generator/internal/session"
)

func newUnstructured(gvk schema.GroupVersionKind, name string) *unstructured.Unstructured {
	u := &unstructured.Unstructured{}
	u.SetGroupVersionKind(gvk)
	u.SetName(name)
	return u
}

func TestHandler_Users_RequiresConnection(t *testing.T) {
	h := NewHandler()
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Users(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 when not connected, got %d", rec.Code)
	}
}

func TestHandler_Groups_RequiresConnection(t *testing.T) {
	h := NewHandler()
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodGet, "/api/groups", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Groups(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 when not connected, got %d", rec.Code)
	}
}

func TestHandler_Users_ListsFromDynamicClient(t *testing.T) {
	h := NewHandler()
	scheme := runtime.NewScheme()
	gvrToListKind := map[schema.GroupVersionResource]string{userGVR: "UserList"}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind,
		newUnstructured(schema.GroupVersionKind{Group: "user.openshift.io", Version: "v1", Kind: "User"}, "alice"),
	)
	sess := &session.Session{ID: "s1", Authenticated: true, DynamicClient: dyn}
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Users(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "[\"alice\"]\n" {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}

func TestHandler_Groups_ListsFromDynamicClient(t *testing.T) {
	h := NewHandler()
	scheme := runtime.NewScheme()
	gvrToListKind := map[schema.GroupVersionResource]string{groupGVR: "GroupList"}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind,
		newUnstructured(schema.GroupVersionKind{Group: "user.openshift.io", Version: "v1", Kind: "Group"}, "cluster-admins"),
	)
	sess := &session.Session{ID: "s1", Authenticated: true, DynamicClient: dyn}
	req := httptest.NewRequest(http.MethodGet, "/api/groups", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Groups(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "[\"cluster-admins\"]\n" {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}

func TestHandler_Users_FailsGracefullyWhenAPIGroupMissing(t *testing.T) {
	h := NewHandler()
	scheme := runtime.NewScheme()
	gvrToListKind := map[schema.GroupVersionResource]string{userGVR: "UserList"}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind)
	// A real, non-OpenShift API server returns an ordinary error (404 Not
	// Found) when asked to list a resource under an API group it doesn't
	// serve at all (user.openshift.io). Simulate that with a reactor,
	// rather than relying on the fake client's own "unregistered GVR"
	// behavior, which panics instead of erroring (a fake-client-only
	// footgun, not representative of a real cluster).
	dyn.PrependReactor("list", "users", func(action clienttesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewNotFound(schema.GroupResource{Group: "user.openshift.io", Resource: "users"}, "")
	})
	sess := &session.Session{ID: "s1", Authenticated: true, DynamicClient: dyn}
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Users(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", rec.Code, rec.Body.String())
	}
}