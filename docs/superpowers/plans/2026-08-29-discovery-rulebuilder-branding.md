# Discovery, Rule Builder, Split-Pane YAML & Branding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `rbac-generator`'s Create page so users can (1) build policy rules via cascading apiGroups→resources→subResources→verbs dropdowns that surface CRD-backed resources distinctly, (2) see a live, always-visible, two-way-synced YAML pane next to the form instead of a Form/YAML toggle, and (3) get a branded blue masthead with a logo and `?` help tooltips on every required field.

**Architecture:** Backend `discovery.Resource` gains `SubResources`/`IsCustomResource` fields, computed via a group-name heuristic (no new cluster permissions needed). The frontend's `RuleBuilder` replaces its flat resources chip-list with a cascading `ResourcePicker` sub-component; the existing `YamlToggle` toggle component is replaced by an always-visible `FormYamlSplit` split-pane component with debounced two-way sync; branding is a scoped masthead CSS override + a pre-generated logo asset; tooltips use PatternFly's existing `FormGroupLabelHelp`/`Popover` pattern via a small new `FieldHelp` wrapper.

**Tech Stack:** Go 1.25 + `client-go` (backend, unchanged deps), React 19 + TypeScript + PatternFly6 `@patternfly/react-core` v6.6.1 (frontend, unchanged deps — `Flex`/`FlexItem`/`Popover`/`FormGroupLabelHelp` are already available in the installed package, no `npm install` needed).

## Global Constraints

- Every task follows TDD: write the failing test first, verify it fails, implement, verify it passes, commit.
- Backend tests: `cd backend && go test ./...` (run from the `rbac-generator` repo root unless noted). Also run `go build ./...` and `go vet ./...` before each backend commit.
- Frontend tests: `cd frontend && npm test -- --run`. Also run `cd frontend && npm run build` (runs `tsc -b && vite build`) before each frontend commit that touches `.tsx`/`.ts` files, to catch type errors.
- No new dependencies are required for this plan — do not run `npm install` or `go get` for anything; everything needed already exists in `go.mod`/`package.json`.
- Preserve existing `aria-label`/`data-testid` naming conventions when modifying existing components (e.g. `multiselect-${label}`, `remove-${label}-${value}`, `add-${label}`, `custom-${label}`) since existing tests and any future code may rely on them.
- `resources: ["pods/log"]`-style combined strings are exactly what real Kubernetes RBAC already expects on the wire — never introduce a different combining format or transform it at apply/dry-run time.
- This plan does not touch the `Containerfile`, kustomize manifests, or `README.md` — no container/deployment changes are in scope.
- The approved logo asset is already saved at `frontend/src/assets/logo.png` (128×128) and `frontend/public/favicon.png` (32×32) — do not regenerate it; the design (blue `#0066CC` masthead, logo kept red `#A30000`/white) was approved via the visual companion in the design spec, `docs/superpowers/specs/2026-08-29-discovery-rulebuilder-branding-design.md`.

---

## Task 1: Backend discovery — SubResources & IsCustomResource

**Files:**
- Modify: `backend/internal/discovery/discovery.go`
- Test: `backend/internal/discovery/discovery_test.go`

**Interfaces:**
- Consumes: nothing new (uses existing `k8sdiscovery.DiscoveryInterface` from `k8s.io/client-go/discovery`).
- Produces:
  - `type Resource struct { Group, Version, Resource, Kind string; Namespaced bool; SubResources []string; IsCustomResource bool }` (extends the existing struct with two new JSON fields: `subResources` (omitempty), `isCustomResource`).
  - `func IsBuiltinGroup(group string) bool` — exported so Task 2's frontend-facing contract (via the JSON response) and any future backend code can reuse the classification.
  - `func StaticResources() []Resource` and `func LiveResources(disc k8sdiscovery.DiscoveryInterface) ([]Resource, error)` keep their existing signatures; their *output* now includes populated `SubResources`/`IsCustomResource`. Task 2 (frontend) consumes the JSON shape `{ group, version, resource, kind, namespaced, subResources?, isCustomResource }` via `GET /api/discovery/resources`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/internal/discovery/discovery_test.go` (add these imports to the existing `import (...)` block: `discoveryfake "k8s.io/client-go/discovery/fake"` and `"k8s.io/client-go/kubernetes/fake"` — note `fake` is already imported for `corev1`/`ServiceAccount` fixtures, so just add the `discoveryfake` alias import alongside it):

```go
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && go test ./internal/discovery/... -run 'TestLiveResources|TestIsBuiltinGroup|TestStaticResources_Pods|TestStaticResources_AreNot' -v`
Expected: build failure (`IsBuiltinGroup` undefined, `disc.Resources` field on wrong type until the alias import is added, `SubResources`/`IsCustomResource` fields undefined on `Resource`).

- [ ] **Step 3: Implement**

Replace the full contents of `backend/internal/discovery/discovery.go` with:

```go
package discovery

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sdiscovery "k8s.io/client-go/discovery"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

type Resource struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Resource         string   `json:"resource"`
	Kind             string   `json:"kind"`
	Namespaced       bool     `json:"namespaced"`
	SubResources     []string `json:"subResources,omitempty"`
	IsCustomResource bool     `json:"isCustomResource"`
}

type ResourcesResponse struct {
	Source    string     `json:"source"`
	Resources []Resource `json:"resources"`
	Verbs     []string   `json:"verbs"`
}

var staticVerbs = []string{"get", "list", "watch", "create", "update", "patch", "delete", "deletecollection", "*"}

// staticSubResources hand-picks common subresources for built-in kinds that
// have them. StaticResources() is an offline fallback with no live API
// discovery to consult, so this list is maintained by hand.
var staticSubResources = map[string][]string{
	"pods":         {"log", "status", "exec", "portforward", "attach", "ephemeralcontainers"},
	"deployments":  {"scale", "status"},
	"statefulsets": {"scale", "status"},
	"replicasets":  {"scale", "status"},
	"nodes":        {"status", "proxy"},
}

var staticResources = []Resource{
	{Group: "", Version: "v1", Resource: "pods", Kind: "Pod", Namespaced: true},
	{Group: "", Version: "v1", Resource: "services", Kind: "Service", Namespaced: true},
	{Group: "", Version: "v1", Resource: "configmaps", Kind: "ConfigMap", Namespaced: true},
	{Group: "", Version: "v1", Resource: "secrets", Kind: "Secret", Namespaced: true},
	{Group: "", Version: "v1", Resource: "namespaces", Kind: "Namespace", Namespaced: false},
	{Group: "", Version: "v1", Resource: "nodes", Kind: "Node", Namespaced: false},
	{Group: "", Version: "v1", Resource: "persistentvolumeclaims", Kind: "PersistentVolumeClaim", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "deployments", Kind: "Deployment", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "statefulsets", Kind: "StatefulSet", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "daemonsets", Kind: "DaemonSet", Namespaced: true},
	{Group: "apps", Version: "v1", Resource: "replicasets", Kind: "ReplicaSet", Namespaced: true},
	{Group: "batch", Version: "v1", Resource: "jobs", Kind: "Job", Namespaced: true},
	{Group: "batch", Version: "v1", Resource: "cronjobs", Kind: "CronJob", Namespaced: true},
	{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses", Kind: "Ingress", Namespaced: true},
	{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies", Kind: "NetworkPolicy", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles", Kind: "Role", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings", Kind: "RoleBinding", Namespaced: true},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles", Kind: "ClusterRole", Namespaced: false},
	{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings", Kind: "ClusterRoleBinding", Namespaced: false},
}

func init() {
	for i := range staticResources {
		if subs, ok := staticSubResources[staticResources[i].Resource]; ok {
			staticResources[i].SubResources = subs
		}
	}
}

func StaticVerbs() []string       { return staticVerbs }
func StaticResources() []Resource { return staticResources }

// builtinGroups lists API groups (besides the empty core group and anything
// ending in ".k8s.io", handled separately below) that ship with vanilla
// Kubernetes and are not CRDs.
var builtinGroups = map[string]bool{
	"":            true,
	"apps":        true,
	"batch":       true,
	"policy":      true,
	"autoscaling": true,
}

// IsBuiltinGroup reports whether group is a well-known built-in Kubernetes
// API group, as opposed to a CRD-backed custom resource group. This is a
// naming heuristic, not a definitive lookup against the cluster's installed
// CustomResourceDefinitions (which would need a separate apiextensions.k8s.io
// API call and its own RBAC permission) — it correctly classifies the vast
// majority of real CRDs, since they almost always use a custom domain-style
// group (e.g. "route.openshift.io", "tekton.dev").
func IsBuiltinGroup(group string) bool {
	if builtinGroups[group] {
		return true
	}
	return strings.HasSuffix(group, ".k8s.io")
}

// LiveResources queries cluster API discovery for the current apiGroups and
// resources. Subresources (e.g. pods/status) are grouped onto their parent
// resource's SubResources field instead of being skipped.
func LiveResources(disc k8sdiscovery.DiscoveryInterface) ([]Resource, error) {
	_, apiLists, err := disc.ServerGroupsAndResources()
	if len(apiLists) == 0 {
		return nil, err
	}

	type key struct {
		group, version, resource string
	}
	index := make(map[key]int)
	var out []Resource

	for _, list := range apiLists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		// Two passes per list so a subresource is never dropped just because
		// discovery happened to return it before its parent resource.
		for _, res := range list.APIResources {
			if strings.Contains(res.Name, "/") {
				continue
			}
			out = append(out, Resource{
				Group:            gv.Group,
				Version:          gv.Version,
				Resource:         res.Name,
				Kind:             res.Kind,
				Namespaced:       res.Namespaced,
				IsCustomResource: !IsBuiltinGroup(gv.Group),
			})
			index[key{gv.Group, gv.Version, res.Name}] = len(out) - 1
		}
		for _, res := range list.APIResources {
			parent, sub, isSub := strings.Cut(res.Name, "/")
			if !isSub {
				continue
			}
			if idx, ok := index[key{gv.Group, gv.Version, parent}]; ok {
				out[idx].SubResources = append(out[idx].SubResources, sub)
			}
		}
	}
	return out, nil
}

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Resources(w http.ResponseWriter, r *http.Request) {
	sess, _ := session.FromContext(r.Context())
	if sess != nil && sess.Clientset != nil {
		if resources, err := LiveResources(sess.Clientset.Discovery()); err == nil && len(resources) > 0 {
			httpjson.WriteJSON(w, http.StatusOK, ResourcesResponse{Source: "live", Resources: resources, Verbs: StaticVerbs()})
			return
		}
	}
	httpjson.WriteJSON(w, http.StatusOK, ResourcesResponse{Source: "static", Resources: StaticResources(), Verbs: StaticVerbs()})
}

func (h *Handler) Namespaces(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}
	list, err := sess.Clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	httpjson.WriteJSON(w, http.StatusOK, names)
}

func (h *Handler) ServiceAccounts(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}
	namespace := chi.URLParam(r, "namespace")
	list, err := sess.Clientset.CoreV1().ServiceAccounts(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	names := make([]string, 0, len(list.Items))
	for _, sa := range list.Items {
		names = append(names, sa.Name)
	}
	httpjson.WriteJSON(w, http.StatusOK, names)
}
```

Then add the `discoveryfake` import to `backend/internal/discovery/discovery_test.go`'s existing import block, so it reads:

```go
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && go build ./... && go vet ./... && go test ./internal/discovery/... -v`
Expected: all tests PASS, including the pre-existing ones (`TestStaticResources_NotEmpty`, `TestHandler_Resources_FallsBackToStaticWhenNotConnected`, etc.).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && go test ./...`
Expected: all packages PASS (no other package touches `discovery.Resource`'s struct literal fields positionally, so this is a low-risk change, but verify anyway).

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/discovery/discovery.go internal/discovery/discovery_test.go
git commit -m "Add SubResources and IsCustomResource to discovery.Resource

LiveResources now groups subresources (e.g. pods/log) onto their parent
resource's SubResources field instead of skipping them, and classifies
each resource's API group as built-in or custom via a naming heuristic
(IsBuiltinGroup). StaticResources gets hand-picked SubResources for the
built-ins that commonly have them. Enables the frontend rule builder to
offer a resource+subResource picker and label CRD-backed resources."
```

---

## Task 2: Frontend — cascading Rule Builder with subResource picker & custom-resource labeling

**Files:**
- Modify: `frontend/src/types/rbac.ts`
- Modify: `frontend/src/components/RuleBuilder.tsx`
- Modify: `frontend/src/pages/Create.tsx`
- Test: `frontend/src/components/RuleBuilder.test.tsx`
- Test: `frontend/src/pages/Create.test.tsx`

**Interfaces:**
- Consumes: Task 1's JSON shape `{ group, version, resource, kind, namespaced, subResources?, isCustomResource }` from `GET /api/discovery/resources`.
- Produces: `RuleBuilder`'s prop `resourceCatalog?: DiscoveryResource[]` (replaces the old `resourceOptions?: string[]` prop — there are no other consumers of that prop besides `Create.tsx`, updated in this same task).

- [ ] **Step 1: Extend the DiscoveryResource type**

In `frontend/src/types/rbac.ts`, replace:

```typescript
export interface DiscoveryResource {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
}
```

with:

```typescript
export interface DiscoveryResource {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  subResources?: string[];
  isCustomResource: boolean;
}
```

- [ ] **Step 2: Write the failing RuleBuilder tests**

Add `within` to the existing `@testing-library/react` import at the top of `frontend/src/components/RuleBuilder.test.tsx`:

```typescript
import { render, screen, fireEvent, within } from '@testing-library/react';
```

Then append these tests inside the existing `describe('RuleBuilder', () => { ... })` block (add them after the last existing `it(...)`, before the closing `});`):

```typescript
  it("filters the resources dropdown to the rule's selected apiGroups", () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(
      <RuleBuilder rules={[{ apiGroups: ['apps'], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />,
    );
    const select = screen.getByLabelText('add-resources');
    expect(within(select).getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'pods' })).not.toBeInTheDocument();
  });

  it('lists all resources when no apiGroup is selected yet', () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    const select = screen.getByLabelText('add-resources');
    expect(within(select).getByRole('option', { name: 'pods' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'deployments' })).toBeInTheDocument();
  });

  it('suffixes custom-resource options with "(Custom Resource)"', () => {
    const catalog = [
      { group: 'tekton.dev', version: 'v1', resource: 'pipelines', kind: 'Pipeline', namespaced: true, isCustomResource: true },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    expect(
      within(screen.getByLabelText('add-resources')).getByRole('option', { name: 'pipelines (Custom Resource)' }),
    ).toBeInTheDocument();
  });

  it('adds a bare resource with no subResource selected', () => {
    const onChange = vi.fn();
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false, subResources: ['log'] },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} resourceCatalog={catalog} />);
    fireEvent.change(screen.getByLabelText('add-resources'), { target: { value: 'pods' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['pods'], verbs: [] }]);
  });

  it('combines resource and subResource into a single chip', () => {
    const onChange = vi.fn();
    const catalog = [
      {
        group: '',
        version: 'v1',
        resource: 'pods',
        kind: 'Pod',
        namespaced: true,
        isCustomResource: false,
        subResources: ['log', 'status'],
      },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} resourceCatalog={catalog} />);
    fireEvent.change(screen.getByLabelText('add-resources'), { target: { value: 'pods' } });
    fireEvent.change(screen.getByLabelText('add-subresource'), { target: { value: 'log' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['pods/log'], verbs: [] }]);
  });

  it('adds a custom resource string typed into the free-text field', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} />);
    const input = screen.getByLabelText('custom-resources');
    fireEvent.change(input, { target: { value: 'widgets.example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['widgets.example.com'], verbs: [] }]);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npm test -- --run RuleBuilder`
Expected: FAIL — `add-resources`/`add-subresource`/`custom-resources` labels not found (the current `resources` field still uses the old flat `ChipMultiSelect` wired to a `resourceOptions` prop that no longer exists on the test calls).

- [ ] **Step 4: Implement — replace RuleBuilder.tsx**

Replace the full contents of `frontend/src/components/RuleBuilder.tsx` with:

```typescript
// frontend/src/components/RuleBuilder.tsx
import { useRef, useState } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { DiscoveryResource, PolicyRule } from '../types/rbac';
import { FieldHelp } from './FieldHelp';

interface RuleBuilderProps {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
  resourceCatalog?: DiscoveryResource[];
  groupOptions?: string[];
  verbOptions?: string[];
}

interface ChipMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  helpText?: string;
}

function ChipMultiSelect({ label, values, options, onChange, helpText }: ChipMultiSelectProps) {
  const [pending, setPending] = useState('');

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setPending('');
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div data-testid={`multiselect-${label}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
        <strong>{label}</strong>
        {helpText && <FieldHelp label={label}>{helpText}</FieldHelp>}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <span key={value} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0 0.25rem' }}>
            {value}
            <button type="button" aria-label={`remove-${label}-${value}`} onClick={() => removeValue(value)}>
              &times;
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {options.length > 0 && (
          <FormSelect aria-label={`add-${label}`} value="" onChange={(_e, value) => addValue(value)}>
            <FormSelectOption key="" value="" label={`Add ${label}...`} />
            {options.filter((o) => !values.includes(o)).map((option) => (
              <FormSelectOption key={option} value={option} label={option} />
            ))}
          </FormSelect>
        )}
        <TextInput
          aria-label={`custom-${label}`}
          placeholder={`Custom ${label}`}
          value={pending}
          onChange={(_e, value) => setPending(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue(pending);
            }
          }}
        />
        <Button variant="plain" aria-label={`add-custom-${label}`} onClick={() => addValue(pending)}>
          <PlusCircleIcon />
        </Button>
      </div>
    </div>
  );
}

interface ResourcePickerProps {
  values: string[];
  catalog: DiscoveryResource[];
  selectedGroups: string[];
  onChange: (values: string[]) => void;
}

function ResourcePicker({ values, catalog, selectedGroups, onChange }: ResourcePickerProps) {
  const [selectedResource, setSelectedResource] = useState('');
  const [selectedSubResource, setSelectedSubResource] = useState('');
  const [pending, setPending] = useState('');

  const filtered = selectedGroups.length > 0 ? catalog.filter((entry) => selectedGroups.includes(entry.group)) : catalog;
  const currentEntry = filtered.find((entry) => entry.resource === selectedResource);
  const subResourceOptions = currentEntry?.subResources ?? [];

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  const handleResourceSelect = (value: string) => {
    setSelectedResource(value);
    setSelectedSubResource('');
  };

  const handlePickerAdd = () => {
    if (!selectedResource) return;
    const combined = selectedSubResource ? `${selectedResource}/${selectedSubResource}` : selectedResource;
    addValue(combined);
    setSelectedResource('');
    setSelectedSubResource('');
  };

  return (
    <div data-testid="multiselect-resources">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
        <strong>resources</strong>
        <FieldHelp label="resources">
          The resource type(s) this rule applies to, e.g. pods, deployments. Custom-resource (CRD-backed) types are
          labeled accordingly.
        </FieldHelp>
        <span style={{ marginLeft: '0.5rem' }} />
        <strong>subResource</strong>
        <FieldHelp label="subResource">
          Optional. A specific sub-endpoint of the chosen resource, e.g. "log" or "status" for pods. Leave as
          "— none —" to grant access to the resource itself.
        </FieldHelp>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <span key={value} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0 0.25rem' }}>
            {value}
            <button type="button" aria-label={`remove-resources-${value}`} onClick={() => removeValue(value)}>
              &times;
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {filtered.length > 0 && (
          <FormSelect aria-label="add-resources" value={selectedResource} onChange={(_e, value) => handleResourceSelect(value)}>
            <FormSelectOption key="" value="" label="Add resource..." />
            {filtered.map((entry) => (
              <FormSelectOption
                key={`${entry.group}/${entry.resource}`}
                value={entry.resource}
                label={entry.isCustomResource ? `${entry.resource} (Custom Resource)` : entry.resource}
              />
            ))}
          </FormSelect>
        )}
        {selectedResource && subResourceOptions.length > 0 && (
          <>
            <span>/</span>
            <FormSelect aria-label="add-subresource" value={selectedSubResource} onChange={(_e, value) => setSelectedSubResource(value)}>
              <FormSelectOption key="" value="" label="— none —" />
              {subResourceOptions.map((sub) => (
                <FormSelectOption key={sub} value={sub} label={sub} />
              ))}
            </FormSelect>
          </>
        )}
        {selectedResource && (
          <Button variant="secondary" onClick={handlePickerAdd}>
            Add
          </Button>
        )}
        <TextInput
          aria-label="custom-resources"
          placeholder="Custom resources"
          value={pending}
          onChange={(_e, value) => setPending(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue(pending);
              setPending('');
            }
          }}
        />
        <Button
          variant="plain"
          aria-label="add-custom-resources"
          onClick={() => {
            addValue(pending);
            setPending('');
          }}
        >
          <PlusCircleIcon />
        </Button>
      </div>
    </div>
  );
}

export function RuleBuilder({ rules, onChange, resourceCatalog = [], groupOptions = [], verbOptions = [] }: RuleBuilderProps) {
  const objectKeysRef = useRef(new WeakMap<object, number>());
  const nextKeyRef = useRef(0);

  const getObjectKey = (obj: object) => {
    const map = objectKeysRef.current;
    let key = map.get(obj);
    if (key === undefined) {
      key = nextKeyRef.current++;
      map.set(obj, key);
    }
    return key;
  };

  const updateRule = (index: number, field: keyof PolicyRule, values: string[]) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, [field]: values } : rule)));
  };

  const addRule = () => {
    onChange([...rules, { apiGroups: [], resources: [], verbs: [] }]);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="rule-builder">
      {rules.map((rule, index) => (
        <div key={getObjectKey(rule)} data-testid={`rule-row-${index}`} style={{ border: '1px solid #ccc', padding: '0.5rem', marginBottom: '0.5rem' }}>
          <ChipMultiSelect
            label="apiGroups"
            values={rule.apiGroups}
            options={groupOptions}
            onChange={(v) => updateRule(index, 'apiGroups', v)}
            helpText='The API group(s) this rule applies to. Use the empty/core option for built-ins like pods and services, or a group like "apps" for Deployments.'
          />
          <ResourcePicker
            values={rule.resources}
            catalog={resourceCatalog}
            selectedGroups={rule.apiGroups}
            onChange={(v) => updateRule(index, 'resources', v)}
          />
          <ChipMultiSelect
            label="verbs"
            values={rule.verbs}
            options={verbOptions}
            onChange={(v) => updateRule(index, 'verbs', v)}
            helpText="The actions this rule allows, e.g. get, list, watch."
          />
          <Button variant="plain" aria-label={`remove-rule-${index}`} onClick={() => removeRule(index)}>
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addRule}>
        Add rule
      </Button>
    </div>
  );
}
```

> Note: this step imports `FieldHelp` from `./FieldHelp`, which doesn't exist yet — it's created in Task 5. Until Task 5 runs, this import will fail to compile. **Temporarily** create a minimal placeholder so Task 2 and Task 3 can compile and their tests can run in isolation:

Create `frontend/src/components/FieldHelp.tsx` (temporary minimal version — Task 5 replaces this with the full tooltip implementation):

```typescript
// frontend/src/components/FieldHelp.tsx
// TEMPORARY placeholder — Task 5 replaces this with a real Popover-based
// help tooltip. This stub exists only so Task 2/3/4 compile in isolation.
import type { ReactNode } from 'react';

interface FieldHelpProps {
  label: string;
  children: ReactNode;
}

export function FieldHelp({ label }: FieldHelpProps) {
  return <span aria-label={`${label} help`} />;
}
```

- [ ] **Step 5: Update Create.tsx's catalog shape and RuleBuilder wiring**

In `frontend/src/pages/Create.tsx`, update the import line:

```typescript
import type { Kind, RbacResource } from '../types/rbac';
```

to:

```typescript
import type { Kind, RbacResource, DiscoveryResource } from '../types/rbac';
```

Replace the `catalog` state declaration:

```typescript
  const [catalog, setCatalog] = useState<{ groups: string[]; resources: string[]; verbs: string[] }>({
    groups: [],
    resources: [],
    verbs: [],
  });
```

with:

```typescript
  const [catalog, setCatalog] = useState<{ groups: string[]; resources: DiscoveryResource[]; verbs: string[] }>({
    groups: [],
    resources: [],
    verbs: [],
  });
```

Replace the discovery-loading `useEffect`:

```typescript
  useEffect(() => {
    getDiscoveryResources()
      .then((data) => {
        setCatalog({
          groups: Array.from(new Set(data.resources.map((r) => r.group))).sort(),
          resources: Array.from(new Set(data.resources.map((r) => r.resource))).sort(),
          verbs: data.verbs,
        });
        setCatalogWarning(null);
      })
      .catch(() => setCatalogWarning('Failed to load the resource catalog; autocomplete suggestions will be unavailable.'));
  }, [connected]);
```

with:

```typescript
  useEffect(() => {
    getDiscoveryResources()
      .then((data) => {
        // Discovery can list the same (group, resource) more than once
        // across API versions (e.g. "apps/v1" and "apps/v1beta1" both
        // exposing "deployments") — dedupe so the dropdown doesn't show
        // duplicate options.
        const byKey = new Map<string, DiscoveryResource>();
        for (const r of data.resources) {
          byKey.set(`${r.group}/${r.resource}`, r);
        }
        const resources = Array.from(byKey.values());
        setCatalog({
          groups: Array.from(new Set(resources.map((r) => r.group))).sort(),
          resources,
          verbs: data.verbs,
        });
        setCatalogWarning(null);
      })
      .catch(() => setCatalogWarning('Failed to load the resource catalog; autocomplete suggestions will be unavailable.'));
  }, [connected]);
```

Replace the `RuleBuilder` usage inside `renderFields`:

```typescript
      {requiresRules(kind) && (
        <RuleBuilder
          rules={resource.rules ?? []}
          onChange={(rules) => updateField('rules', rules)}
          groupOptions={catalog.groups}
          resourceOptions={catalog.resources}
          verbOptions={catalog.verbs}
        />
      )}
```

with:

```typescript
      {requiresRules(kind) && (
        <RuleBuilder
          rules={resource.rules ?? []}
          onChange={(rules) => updateField('rules', rules)}
          groupOptions={catalog.groups}
          resourceCatalog={catalog.resources}
          verbOptions={catalog.verbs}
        />
      )}
```

- [ ] **Step 6: Write the failing Create.tsx test for catalog dedup**

Add `within` to the existing import in `frontend/src/pages/Create.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

Append this test inside the existing `describe('CreatePage', ...)` block:

```typescript
  it('dedupes discovery resources by group+resource before building the catalog', async () => {
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({
      source: 'live',
      resources: [
        { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
        { group: 'apps', version: 'v1beta1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
      ],
      verbs: ['get'],
    });
    render(<CreatePage connected />);
    await waitFor(() => screen.getByTestId('rule-builder'));
    const options = within(screen.getByLabelText('add-resources')).getAllByRole('option', { name: 'deployments' });
    expect(options).toHaveLength(1);
  });
```

- [ ] **Step 7: Run all the new/changed tests to verify they pass**

Run: `cd frontend && npm test -- --run RuleBuilder Create`
Expected: all PASS, including the pre-existing `RuleBuilder.test.tsx` and `Create.test.tsx` tests (the "adds a custom verb..." / "adds a verb selected from the discovery options dropdown" / "removes a value..." tests still reference `verbs`, unaffected by the resources rework).

- [ ] **Step 8: Run the full frontend suite and type-check**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests PASS; the build succeeds (the temporary `FieldHelp` stub from Step 4 satisfies the type-checker until Task 5 replaces it).

- [ ] **Step 9: Commit**

```bash
cd frontend && git add src/types/rbac.ts src/components/RuleBuilder.tsx src/components/RuleBuilder.test.tsx src/components/FieldHelp.tsx src/pages/Create.tsx src/pages/Create.test.tsx
git commit -m "Add cascading resource+subResource picker to RuleBuilder

Replaces the flat resources chip-list with a ResourcePicker that
cascades (filters to the rule's selected apiGroups), labels
CRD-backed resources as \"(Custom Resource)\", and lets a resource +
optional subResource combine into a single \"resource[/subResource]\"
chip matching real RBAC wire format exactly. Create.tsx now keeps the
richer per-resource discovery shape instead of flattening it to
strings immediately. Includes a temporary FieldHelp stub; Task 5
replaces it with the real tooltip implementation."
```

---

## Task 3: Frontend — FormYamlSplit (replaces the Form/YAML toggle)

**Files:**
- Create: `frontend/src/components/FormYamlSplit.tsx`
- Create: `frontend/src/components/FormYamlSplit.test.tsx`
- Delete: `frontend/src/components/YamlToggle.tsx`
- Delete: `frontend/src/components/YamlToggle.test.tsx`
- Modify: `frontend/src/pages/Create.tsx`
- Modify: `frontend/src/pages/Create.test.tsx`

**Interfaces:**
- Consumes: `toYaml`/`fromYaml` from `frontend/src/lib/yamlSync.ts` (unchanged).
- Produces: `FormYamlSplit<T>({ value: T, onChange: (value: T) => void, kind: string, renderForm: () => ReactNode })` — same prop names/types as the old `YamlToggle`, so `Create.tsx`'s call site only needs its import and JSX tag name updated.

- [ ] **Step 1: Write the failing FormYamlSplit tests**

Create `frontend/src/components/FormYamlSplit.test.tsx`:

```typescript
// frontend/src/components/FormYamlSplit.test.tsx
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FormYamlSplit } from './FormYamlSplit';

vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditor: ({ code, onChange }: { code: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-code-editor" value={code} onChange={(e) => onChange(e.target.value)} />
  ),
  Language: { yaml: 'yaml' },
}));

function Harness({ initial }: { initial: { name: string } }) {
  const [value, setValue] = useState(initial);
  return (
    <FormYamlSplit value={value} onChange={setValue} kind="Role" renderForm={() => <div data-testid="form-view">{value.name}</div>} />
  );
}

describe('FormYamlSplit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the form and the YAML editor at the same time', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
  });

  it('reflects the initial value in the YAML pane', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('name: reader\n');
  });

  it('updates the YAML pane when the form value changes externally', () => {
    const { rerender } = render(
      <FormYamlSplit value={{ name: 'a' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />,
    );
    rerender(
      <FormYamlSplit value={{ name: 'b' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />,
    );
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('name: b\n');
  });

  it('parses valid YAML back into the form after the debounce', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: updated\n' } });
    vi.advanceTimersByTime(400);
    expect(screen.getByTestId('form-view')).toHaveTextContent('updated');
  });

  it('shows an inline error for invalid YAML without blocking typing or reverting the text', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'kind: ClusterRole\nname: updated\n' } });
    vi.advanceTimersByTime(400);
    expect(screen.getByRole('alert')).toHaveTextContent('Expected kind "Role", got "ClusterRole"');
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('kind: ClusterRole\nname: updated\n');
    expect(screen.getByTestId('form-view')).toHaveTextContent('reader');
  });

  it("does not clobber the YAML pane's own text with a reformatted round-trip after a YAML-originated change", () => {
    render(<Harness initial={{ name: 'reader' }} />);
    // Deliberately unusual quoting that toYaml would not reproduce
    // byte-for-byte, to prove the pane keeps the user's raw text instead of
    // re-serializing the just-parsed value back into it.
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: "name: 'updated'\n" } });
    vi.advanceTimersByTime(400);
    expect(screen.getByTestId('mock-code-editor')).toHaveValue("name: 'updated'\n");
  });

  it('cancels a pending YAML-side parse if the form changes first', () => {
    const onChange = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState<{ name: string }>({ name: 'reader' });
      return (
        <>
          <button onClick={() => setValue({ name: 'from-form' })}>set-from-form</button>
          <FormYamlSplit
            value={value}
            onChange={(v) => {
              onChange(v);
              setValue(v);
            }}
            kind="Role"
            renderForm={() => <div data-testid="form-view">{value.name}</div>}
          />
        </>
      );
    }
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: from-yaml\n' } });
    fireEvent.click(screen.getByText('set-from-form'));
    vi.advanceTimersByTime(400);
    expect(onChange).not.toHaveBeenCalledWith({ name: 'from-yaml' });
    expect(screen.getByTestId('form-view')).toHaveTextContent('from-form');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- --run FormYamlSplit`
Expected: FAIL — `./FormYamlSplit` module not found.

- [ ] **Step 3: Implement FormYamlSplit.tsx**

Create `frontend/src/components/FormYamlSplit.tsx`:

```typescript
// frontend/src/components/FormYamlSplit.tsx
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { Flex, FlexItem } from '@patternfly/react-core';
import { toYaml, fromYaml } from '../lib/yamlSync';

interface FormYamlSplitProps<T> {
  value: T;
  onChange: (value: T) => void;
  kind: string;
  renderForm: () => ReactNode;
}

const YAML_SYNC_DEBOUNCE_MS = 400;

export function FormYamlSplit<T>({ value, onChange, kind, renderForm }: FormYamlSplitProps<T>) {
  const [yamlText, setYamlText] = useState(() => toYaml(value));
  const [error, setError] = useState<string | null>(null);
  const lastChangeSource = useRef<'form' | 'yaml'>('form');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lastChangeSource.current === 'yaml') {
      // `value` just changed because we ourselves parsed the YAML pane's
      // text and called onChange; the pane's text is already what produced
      // it, so don't re-serialize it back and clobber the user's raw text
      // (and cursor position) with a reformatted round-trip.
      lastChangeSource.current = 'form';
      return;
    }
    // A genuine form-side change supersedes any YAML edit still pending in
    // the debounce, so a stale parse doesn't overwrite it a moment later.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setYamlText(toYaml(value));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleYamlChange = (text: string) => {
    setYamlText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const parsed = fromYaml<T>(text, kind);
        setError(null);
        lastChangeSource.current = 'yaml';
        onChange(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid YAML');
      }
    }, YAML_SYNC_DEBOUNCE_MS);
  };

  return (
    <div data-testid="form-yaml-split">
      <Flex direction={{ default: 'column', lg: 'row' }} gap={{ default: 'gapMd' }}>
        <FlexItem flex={{ default: 'flex_1' }}>{renderForm()}</FlexItem>
        <FlexItem flex={{ default: 'flex_1' }}>
          {error && <div role="alert">{error}</div>}
          <CodeEditor code={yamlText} language={Language.yaml} onChange={handleYamlChange} height="400px" />
        </FlexItem>
      </Flex>
    </div>
  );
}
```

- [ ] **Step 4: Delete the old YamlToggle files**

```bash
cd frontend && git rm src/components/YamlToggle.tsx src/components/YamlToggle.test.tsx
```

- [ ] **Step 5: Update Create.tsx to use FormYamlSplit**

In `frontend/src/pages/Create.tsx`, replace the import:

```typescript
import { YamlToggle } from '../components/YamlToggle';
```

with:

```typescript
import { FormYamlSplit } from '../components/FormYamlSplit';
```

Replace the JSX usage:

```typescript
          <YamlToggle
            value={resource}
            onChange={(newResource) => {
              setResource(newResource);
              setDryRunPassed(false);
            }}
            kind={kind}
            renderForm={renderFields}
          />
```

with:

```typescript
          <FormYamlSplit
            value={resource}
            onChange={(newResource) => {
              setResource(newResource);
              setDryRunPassed(false);
            }}
            kind={kind}
            renderForm={renderFields}
          />
```

- [ ] **Step 6: Make Create.test.tsx mock FormYamlSplit**

`Create.test.tsx` currently doesn't mock `@patternfly/react-code-editor`, relying on the old toggle never mounting the real Monaco-based editor (it only rendered when a test clicked "YAML", which none did). `FormYamlSplit` now always renders it, so mount the real editor would be unnecessarily heavy/flaky in these business-logic tests — mock `FormYamlSplit` itself to just render the form directly, matching the previous implicit behavior for these tests. Add this mock near the top of `frontend/src/pages/Create.test.tsx`, right after the existing `vi.mock('../api/client');` line:

```typescript
vi.mock('../components/FormYamlSplit', () => ({
  FormYamlSplit: ({ renderForm }: { renderForm: () => React.ReactNode }) => renderForm(),
}));
```

This requires importing the `React` namespace type in the test file (Vitest/TS needs `React.ReactNode` resolvable) — add `import type { ReactNode } from 'react';` to the top of the file's imports and use `ReactNode` instead of `React.ReactNode`:

```typescript
vi.mock('../components/FormYamlSplit', () => ({
  FormYamlSplit: ({ renderForm }: { renderForm: () => ReactNode }) => renderForm(),
}));
```

- [ ] **Step 7: Run the tests to verify everything passes**

Run: `cd frontend && npm test -- --run FormYamlSplit Create`
Expected: all PASS.

- [ ] **Step 8: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests PASS; build succeeds with no references to the deleted `YamlToggle` remaining.

- [ ] **Step 9: Commit**

```bash
cd frontend && git add src/components/FormYamlSplit.tsx src/components/FormYamlSplit.test.tsx src/pages/Create.tsx src/pages/Create.test.tsx
git commit -m "Replace Form/YAML toggle with an always-visible split-pane view

FormYamlSplit shows the form and a live YAML editor side by side,
kept in sync both ways: form edits re-serialize into the YAML pane
immediately, and YAML edits parse back into the form ~400ms after
typing pauses. The YAML pane's own edits never get clobbered by a
reformatted round-trip (tracked via a lastChangeSource ref), and a
pending YAML-side parse is cancelled if the form changes first.
Removes the mutually-exclusive Form/YAML ToggleGroup entirely."
```

---

## Task 4: Frontend — Branding (blue masthead + logo)

**Files:**
- Create: `frontend/src/masthead-theme.css`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/index.html`

The logo asset (`frontend/src/assets/logo.png`, 128×128) and favicon (`frontend/public/favicon.png`, 32×32) already exist in the repo (see Global Constraints) — this task only wires them up.

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (this is a leaf/cosmetic task).

- [ ] **Step 1: Write the failing App.tsx test**

In `frontend/src/App.test.tsx`, add this assertion inside the existing `'shows the app shell when the session is authenticated'` test, right after the existing `expect(screen.getByText('rbac-generator')).toBeInTheDocument();` line:

```typescript
    expect(screen.getByRole('img', { name: 'rbac-generator logo' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run App`
Expected: FAIL — no element with role `img` and name `rbac-generator logo`.

- [ ] **Step 3: Create the masthead CSS override**

Create `frontend/src/masthead-theme.css`:

```css
/* frontend/src/masthead-theme.css */
/* Scoped override: only the masthead bar gets a brand color. Buttons,
   links, active-nav-item, and alerts all keep PatternFly's defaults, so
   destructive/danger semantics stay visually unambiguous from branding. */
.pf-v6-c-masthead {
  background-color: #0066cc;
  color: #ffffff;
}

.pf-v6-c-masthead .pf-v6-c-brand {
  color: #ffffff;
}
```

- [ ] **Step 4: Import the CSS in main.tsx**

In `frontend/src/main.tsx`, add the import right after the PatternFly base CSS import:

```typescript
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import './masthead-theme.css';
import { App } from './App';
```

- [ ] **Step 5: Add the logo to App.tsx's masthead**

In `frontend/src/App.tsx`, add this import near the top with the other imports:

```typescript
import logo from './assets/logo.png';
```

Replace the `masthead` JSX:

```typescript
  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>rbac-generator</MastheadBrand>
      </MastheadMain>
    </Masthead>
  );
```

with:

```typescript
  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <img src={logo} alt="rbac-generator logo" style={{ height: '32px', marginRight: '0.5rem', verticalAlign: 'middle' }} />
          rbac-generator
        </MastheadBrand>
      </MastheadMain>
    </Masthead>
  );
```

- [ ] **Step 6: Add the favicon link to index.html**

In `frontend/index.html`, add the favicon `<link>` inside `<head>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>rbac-generator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run App`
Expected: PASS.

- [ ] **Step 8: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests PASS; build succeeds (confirms the `.png` import resolves correctly via Vite's built-in asset handling and the existing `"types": ["vite/client"]` tsconfig entry).

- [ ] **Step 9: Commit**

```bash
cd frontend && git add src/masthead-theme.css src/main.tsx src/App.tsx src/App.test.tsx index.html src/assets/logo.png public/favicon.png
git commit -m "Add blue masthead and logo branding

Scoped CSS override colors only the .pf-v6-c-masthead bar blue
(#0066CC); buttons/links/alerts keep PatternFly defaults. The
approved padlock+gear logo (kept red/white as a fixed brand mark)
sits in the masthead brand slot and doubles as the browser favicon."
```

---

## Task 5: Frontend — Required-field tooltips

**Files:**
- Create: `frontend/src/components/FieldHelp.tsx` (replaces the temporary stub from Task 2)
- Create: `frontend/src/components/FieldHelp.test.tsx`
- Modify: `frontend/src/pages/Create.tsx`
- Modify: `frontend/src/pages/Create.test.tsx`
- Modify: `frontend/src/components/SubjectBuilder.tsx`
- Modify: `frontend/src/components/SubjectBuilder.test.tsx`
- Modify: `frontend/src/components/RuleBuilder.test.tsx`

**Interfaces:**
- Consumes: PatternFly's existing `Popover` and `FormGroupLabelHelp` components (already installed, no new dependency).
- Produces: `FieldHelp({ label: string, children: ReactNode })` — already consumed by Task 2's `RuleBuilder.tsx` (via the temporary stub, now replaced with the real thing).

- [ ] **Step 1: Write the failing FieldHelp tests**

Create `frontend/src/components/FieldHelp.test.tsx`:

```typescript
// frontend/src/components/FieldHelp.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldHelp } from './FieldHelp';

describe('FieldHelp', () => {
  it('renders a help trigger with an accessible name derived from the label', () => {
    render(<FieldHelp label="Namespace">Some help text</FieldHelp>);
    expect(screen.getByLabelText('Namespace help')).toBeInTheDocument();
  });

  it('shows the help text in a popover when clicked', async () => {
    render(<FieldHelp label="Namespace">The namespace this Role applies to.</FieldHelp>);
    fireEvent.click(screen.getByLabelText('Namespace help'));
    await waitFor(() => expect(screen.getByText('The namespace this Role applies to.')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- --run FieldHelp`
Expected: the first test PASSES against the Task 2 stub (it already renders an `aria-label`), but the second FAILS since the stub renders no popover/body content.

- [ ] **Step 3: Implement the real FieldHelp**

Replace the full contents of `frontend/src/components/FieldHelp.tsx` with:

```typescript
// frontend/src/components/FieldHelp.tsx
import type { ReactNode } from 'react';
import { FormGroupLabelHelp, Popover } from '@patternfly/react-core';

interface FieldHelpProps {
  label: string;
  children: ReactNode;
}

export function FieldHelp({ label, children }: FieldHelpProps) {
  return (
    <Popover bodyContent={children}>
      <FormGroupLabelHelp aria-label={`${label} help`} />
    </Popover>
  );
}
```

- [ ] **Step 4: Run the FieldHelp tests to verify they pass**

Run: `cd frontend && npm test -- --run FieldHelp`
Expected: both PASS.

- [ ] **Step 5: Write the failing RuleBuilder tooltip test**

Append this test inside the existing `describe('RuleBuilder', ...)` block in `frontend/src/components/RuleBuilder.test.tsx`:

```typescript
  it('shows help tooltips for apiGroups, resources, subResource, and verbs', () => {
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} />);
    expect(screen.getByLabelText('apiGroups help')).toBeInTheDocument();
    expect(screen.getByLabelText('resources help')).toBeInTheDocument();
    expect(screen.getByLabelText('subResource help')).toBeInTheDocument();
    expect(screen.getByLabelText('verbs help')).toBeInTheDocument();
  });
```

Run: `cd frontend && npm test -- --run RuleBuilder`
Expected: PASS immediately — Task 2's `RuleBuilder.tsx` already renders these `FieldHelp` instances via the (now-real) `FieldHelp` component; this step is confirmation, not new implementation.

- [ ] **Step 6: Write the failing SubjectBuilder tooltip test and implement it**

Append this test inside the existing `describe('SubjectBuilder', ...)` block in `frontend/src/components/SubjectBuilder.test.tsx`:

```typescript
  it('shows a help tooltip explaining Kind/Name/Namespace', () => {
    render(<SubjectBuilder subjects={[]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByLabelText('Subjects help')).toBeInTheDocument();
  });
```

Run: `cd frontend && npm test -- --run SubjectBuilder`
Expected: FAIL — no such label exists yet.

Add the `FieldHelp` import to `frontend/src/components/SubjectBuilder.tsx`:

```typescript
// frontend/src/components/SubjectBuilder.tsx
import { useRef } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { Subject } from '../types/rbac';
import { FieldHelp } from './FieldHelp';
```

Replace the returned JSX's opening:

```typescript
  return (
    <div data-testid="subject-builder">
      {subjects.map((subject, index) => (
```

with:

```typescript
  return (
    <div data-testid="subject-builder">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
        <strong>Subjects</strong>
        <FieldHelp label="Subjects">
          Who this binding grants the role to. Kind: ServiceAccount (pick from the connected namespace), User, or
          Group. Name: the subject's exact name. Namespace: only needed for ServiceAccount subjects, and must match
          the ServiceAccount's own namespace.
        </FieldHelp>
      </div>
      {subjects.map((subject, index) => (
```

Run: `cd frontend && npm test -- --run SubjectBuilder`
Expected: PASS.

- [ ] **Step 7: Write the failing Create.tsx tooltip tests and implement them**

Append these tests inside the existing `describe('CreatePage', ...)` block in `frontend/src/pages/Create.test.tsx`:

```typescript
  it('shows help tooltips next to the Name and Namespace fields', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByLabelText('Name help')).toBeInTheDocument();
    expect(screen.getByLabelText('Namespace help')).toBeInTheDocument();
  });

  it('shows a help tooltip for Role reference name on binding kinds', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'rolebindings' } });
    expect(screen.getByLabelText('Role reference name help')).toBeInTheDocument();
  });
```

Run: `cd frontend && npm test -- --run Create`
Expected: FAIL — neither tooltip exists on the Create page's `FormGroup`s yet.

In `frontend/src/pages/Create.tsx`, add the import:

```typescript
import { FieldHelp } from '../components/FieldHelp';
```

Replace the three `FormGroup`s in `renderFields`:

```typescript
      <FormGroup label="Name" fieldId="name" isRequired>
        <TextInput id="name" value={resource.name} onChange={(_e, value) => updateField('name', value)} isRequired />
      </FormGroup>
      {isNamespaced(kind) && (
        <FormGroup label="Namespace" fieldId="namespace" isRequired>
          <TextInput id="namespace" value={resource.namespace ?? ''} onChange={(_e, value) => updateField('namespace', value)} isRequired />
        </FormGroup>
      )}
      {requiresSubjects(kind) && (
        <FormGroup label="Role reference name" fieldId="roleRefName" isRequired>
          <TextInput
            id="roleRefName"
            value={resource.roleRef?.name ?? ''}
            onChange={(_e, value) => updateField('roleRef', { kind: kind === 'rolebindings' ? 'Role' : 'ClusterRole', name: value })}
            isRequired
          />
        </FormGroup>
      )}
```

with:

```typescript
      <FormGroup
        label="Name"
        fieldId="name"
        isRequired
        labelHelp={
          <FieldHelp label="Name">
            The resource's name. Must be a valid Kubernetes name (lowercase alphanumeric characters, "-", or ".").
          </FieldHelp>
        }
      >
        <TextInput id="name" value={resource.name} onChange={(_e, value) => updateField('name', value)} isRequired />
      </FormGroup>
      {isNamespaced(kind) && (
        <FormGroup
          label="Namespace"
          fieldId="namespace"
          isRequired
          labelHelp={
            <FieldHelp label="Namespace">
              The namespace this resource applies to. Must be an existing namespace on the connected cluster, e.g.
              "default".
            </FieldHelp>
          }
        >
          <TextInput id="namespace" value={resource.namespace ?? ''} onChange={(_e, value) => updateField('namespace', value)} isRequired />
        </FormGroup>
      )}
      {requiresSubjects(kind) && (
        <FormGroup
          label="Role reference name"
          fieldId="roleRefName"
          isRequired
          labelHelp={
            <FieldHelp label="Role reference name">
              The name of the existing {kind === 'rolebindings' ? 'Role' : 'ClusterRole'} this binding grants. It
              must already exist on the cluster.
            </FieldHelp>
          }
        >
          <TextInput
            id="roleRefName"
            value={resource.roleRef?.name ?? ''}
            onChange={(_e, value) => updateField('roleRef', { kind: kind === 'rolebindings' ? 'Role' : 'ClusterRole', name: value })}
            isRequired
          />
        </FormGroup>
      )}
```

- [ ] **Step 8: Run the Create.tsx tests to verify they pass**

Run: `cd frontend && npm test -- --run Create`
Expected: all PASS.

- [ ] **Step 9: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 10: Commit**

```bash
cd frontend && git add src/components/FieldHelp.tsx src/components/FieldHelp.test.tsx src/components/RuleBuilder.test.tsx src/components/SubjectBuilder.tsx src/components/SubjectBuilder.test.tsx src/pages/Create.tsx src/pages/Create.test.tsx
git commit -m "Add required-field help tooltips to the Create page

FieldHelp wraps PatternFly's existing FormGroupLabelHelp+Popover
pattern into a small \"?\" trigger. Wires it into Create.tsx's
Name/Namespace/Role-reference-name FormGroups, RuleBuilder's
apiGroups/resources/subResource/verbs field labels, and one combined
tooltip on SubjectBuilder explaining Kind/Name/Namespace. Replaces
Task 2's temporary FieldHelp stub with the real implementation."
```

---

## Task 6: Final integration pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && go build ./... && go vet ./... && go test ./...`
Expected: all packages PASS, no vet warnings.

- [ ] **Step 2: Run the full frontend suite and build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests PASS; production build succeeds with no leftover references to `YamlToggle`, `resourceOptions`, or the temporary `FieldHelp` stub.

- [ ] **Step 3: Confirm the old YamlToggle files are gone and no stale references remain**

Run: `cd frontend && grep -rn "YamlToggle" src/ || echo "no matches"`
Expected: `no matches`.

- [ ] **Step 4: Manually smoke-test the dev server**

Run: `cd frontend && npm run dev` (in the background), then open the printed local URL in a browser. Confirm:
- The masthead bar is blue with the padlock+gear logo and "rbac-generator" text.
- Logging in and navigating to Create shows the form on the left and a live YAML pane on the right, updating as you type a Name.
- Switching Kind to Role, adding a rule, picking an apiGroup (e.g. "apps" once connected, or typing one via the free-text field if not connected to a live cluster) filters/labels the resources dropdown as designed.
- Hovering/clicking the `?` icons next to Name/Namespace/rule fields shows the expected help text.

Stop the dev server afterward.

- [ ] **Step 5: Commit (only if Steps 1-4 required any fixes; otherwise skip — nothing to commit)**

If any fixes were needed, commit them with a message describing what was found and fixed during final integration verification.
