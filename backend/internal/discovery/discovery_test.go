package discovery

import (
	"net/http"
	"net/http/httptest"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	discoveryfake "k8s.io/client-go/discovery/fake"
	k8sdiscovery "k8s.io/client-go/discovery"
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

func newFakeDiscovery(t *testing.T, lists []*metav1.APIResourceList) k8sdiscovery.DiscoveryInterface {
	t.Helper()
	cs := fake.NewSimpleClientset()
	disc, ok := cs.Discovery().(*discoveryfake.FakeDiscovery)
	if !ok {
		t.Fatalf("expected *discoveryfake.FakeDiscovery, got %T", cs.Discovery())
	}
	disc.Resources = lists
	return disc
}

func TestLiveResources_GroupsSubResourcesUnderParent(t *testing.T) {
	disc := newFakeDiscovery(t, []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", Kind: "Pod", Namespaced: true},
				{Name: "pods/log", Kind: "Pod", Namespaced: true},
				{Name: "pods/status", Kind: "Pod", Namespaced: true},
			},
		},
	})

	resources, err := LiveResources(disc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resources) != 1 {
		t.Fatalf("expected 1 top-level resource, got %d: %+v", len(resources), resources)
	}
	want := []string{"log", "status"}
	got := resources[0].SubResources
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("expected SubResources %v, got %v", want, got)
	}
}

func TestLiveResources_GroupsSubResourceEvenIfListedBeforeParent(t *testing.T) {
	disc := newFakeDiscovery(t, []*metav1.APIResourceList{
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments/scale", Kind: "Deployment", Namespaced: true},
				{Name: "deployments", Kind: "Deployment", Namespaced: true},
			},
		},
	})

	resources, err := LiveResources(disc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resources) != 1 || len(resources[0].SubResources) != 1 || resources[0].SubResources[0] != "scale" {
		t.Fatalf("expected deployments to have SubResources [\"scale\"], got %+v", resources)
	}
}

func TestLiveResources_MarksCustomResourceGroups(t *testing.T) {
	disc := newFakeDiscovery(t, []*metav1.APIResourceList{
		{GroupVersion: "v1", APIResources: []metav1.APIResource{{Name: "pods", Kind: "Pod", Namespaced: true}}},
		{GroupVersion: "apps/v1", APIResources: []metav1.APIResource{{Name: "deployments", Kind: "Deployment", Namespaced: true}}},
		{GroupVersion: "route.openshift.io/v1", APIResources: []metav1.APIResource{{Name: "routes", Kind: "Route", Namespaced: true}}},
		{GroupVersion: "tekton.dev/v1", APIResources: []metav1.APIResource{{Name: "pipelines", Kind: "Pipeline", Namespaced: true}}},
	})

	resources, err := LiveResources(disc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byResource := map[string]bool{}
	for _, r := range resources {
		byResource[r.Resource] = r.IsCustomResource
	}
	if byResource["pods"] {
		t.Error("expected pods (core group) to be built-in, not custom")
	}
	if byResource["deployments"] {
		t.Error("expected deployments (apps group) to be built-in, not custom")
	}
	if !byResource["routes"] {
		t.Error("expected routes (route.openshift.io) to be classified as a custom resource")
	}
	if !byResource["pipelines"] {
		t.Error("expected pipelines (tekton.dev) to be classified as a custom resource")
	}
}

func TestIsBuiltinGroup(t *testing.T) {
	cases := map[string]bool{
		"":                          true,
		"apps":                      true,
		"batch":                     true,
		"policy":                    true,
		"autoscaling":               true,
		"networking.k8s.io":         true,
		"rbac.authorization.k8s.io": true,
		"route.openshift.io":        false,
		"tekton.dev":                false,
		"myoperator.example.com":    false,
	}
	for group, want := range cases {
		if got := IsBuiltinGroup(group); got != want {
			t.Errorf("IsBuiltinGroup(%q) = %v, want %v", group, got, want)
		}
	}
}

func TestStaticResources_PodsHaveExpectedSubResources(t *testing.T) {
	for _, r := range StaticResources() {
		if r.Resource != "pods" {
			continue
		}
		want := []string{"log", "status", "exec", "portforward", "attach", "ephemeralcontainers"}
		if len(r.SubResources) != len(want) {
			t.Fatalf("expected %d subresources for pods, got %v", len(want), r.SubResources)
		}
		for i, s := range want {
			if r.SubResources[i] != s {
				t.Errorf("pods.SubResources[%d] = %q, want %q", i, r.SubResources[i], s)
			}
		}
		return
	}
	t.Fatal("pods not found in StaticResources")
}

func TestStaticResources_AreNotCustomResources(t *testing.T) {
	for _, r := range StaticResources() {
		if r.IsCustomResource {
			t.Errorf("static resource %q should never be marked IsCustomResource", r.Resource)
		}
	}
}
