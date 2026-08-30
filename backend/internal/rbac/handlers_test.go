// backend/internal/rbac/handlers_test.go
package rbac

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"rbac-generator/internal/session"
)

func newRequest(t *testing.T, method, path string, body []byte, cs *fake.Clientset, params map[string]string) *http.Request {
	t.Helper()
	sess := &session.Session{ID: "s1", Authenticated: true}
	if cs != nil {
		sess.Clientset = cs
	}

	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}

	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = session.NewContext(ctx, sess)
	return req.WithContext(ctx)
}

func TestHandler_Create_Role(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{
		Name:      "reader",
		Namespace: "default",
		Rules:     []PolicyRuleInput{{Resources: []string{"pods"}, Verbs: []string{"get"}}},
	})
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	created, err := cs.RbacV1().Roles("default").Get(context.Background(), "reader", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("expected role to be created: %v", err)
	}
	if created.Name != "reader" {
		t.Errorf("unexpected name: %q", created.Name)
	}
}

func TestHandler_Create_InvalidBuild(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{Namespace: "default"}) // missing name
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandler_Create_NotConnected(t *testing.T) {
	h := NewHandler()
	body, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}})
	req := newRequest(t, http.MethodPost, "/api/rbac/roles", body, nil, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rec.Code)
	}
}

func TestHandler_DryRun_DoesNotPersist(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	body, _ := json.Marshal(CreateRequest{
		Name: "cluster-reader",
		Rules: []PolicyRuleInput{{Resources: []string{"nodes"}, Verbs: []string{"get"}}},
	})
	req := newRequest(t, http.MethodPost, "/api/rbac/clusterroles/dry-run", body, cs, map[string]string{"kind": "clusterroles"})
	rec := httptest.NewRecorder()

	h.DryRun(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// The fake clientset does not honor server-side dry-run, so this only
	// verifies the handler routes DryRun through without error; the real
	// API server enforces DryRun: ["All"] on a live cluster.
}

func TestHandler_List_Roles(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Resources: []string{"pods"}, Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/roles", createBody, cs, map[string]string{"kind": "roles"})
	h.Create(httptest.NewRecorder(), createReq)

	listReq := newRequest(t, http.MethodGet, "/api/rbac/roles?namespace=default", nil, cs, map[string]string{"kind": "roles"})
	rec := httptest.NewRecorder()

	h.List(rec, listReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 role, got %d", len(items))
	}
	// The frontend's RbacResource type expects a flat "name"/"namespace" at
	// the top level (not nested under "metadata"), matching CreateRequest's
	// shape. See frontend/src/types/rbac.ts.
	if name, _ := items[0]["name"].(string); name != "reader" {
		t.Fatalf("expected flat top-level \"name\": %q, got item: %#v", "reader", items[0])
	}
	if ns, _ := items[0]["namespace"].(string); ns != "default" {
		t.Fatalf("expected flat top-level \"namespace\": %q, got item: %#v", "default", items[0])
	}
	if _, hasMetadata := items[0]["metadata"]; hasMetadata {
		t.Fatalf("response must not leak the raw Kubernetes object's \"metadata\" wrapper: %#v", items[0])
	}
}

func TestHandler_Get_Role(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Resources: []string{"pods"}, Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/roles", createBody, cs, map[string]string{"kind": "roles"})
	h.Create(httptest.NewRecorder(), createReq)

	getReq := newRequest(t, http.MethodGet, "/api/rbac/roles/default/reader", nil, cs, map[string]string{"kind": "roles", "namespace": "default", "name": "reader"})
	rec := httptest.NewRecorder()

	h.Get(rec, getReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var got map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if name, _ := got["name"].(string); name != "reader" {
		t.Fatalf("expected flat top-level \"name\": %q, got: %#v", "reader", got)
	}
	if _, hasMetadata := got["metadata"]; hasMetadata {
		t.Fatalf("response must not leak the raw Kubernetes object's \"metadata\" wrapper: %#v", got)
	}
}

func TestHandler_Get_ClusterScoped_NoNamespaceSegment(t *testing.T) {
	h := NewHandler()
	cs := fake.NewSimpleClientset()
	createBody, _ := json.Marshal(CreateRequest{Name: "cluster-reader", Rules: []PolicyRuleInput{{Resources: []string{"nodes"}, Verbs: []string{"get"}}}})
	createReq := newRequest(t, http.MethodPost, "/api/rbac/clusterroles", createBody, cs, map[string]string{"kind": "clusterroles"})
	h.Create(httptest.NewRecorder(), createReq)

	getReq := newRequest(t, http.MethodGet, "/api/rbac/clusterroles/cluster-reader", nil, cs, map[string]string{"kind": "clusterroles", "name": "cluster-reader"})
	rec := httptest.NewRecorder()

	h.Get(rec, getReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
