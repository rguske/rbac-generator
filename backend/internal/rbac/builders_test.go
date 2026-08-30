// backend/internal/rbac/builders_test.go
package rbac

import "testing"

func TestBuildRole_Success(t *testing.T) {
	req := CreateRequest{
		Name:      "reader",
		Namespace: "default",
		Rules:     []PolicyRuleInput{{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}}},
	}
	role, err := BuildRole(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role.Name != "reader" || role.Namespace != "default" {
		t.Errorf("unexpected metadata: %+v", role.ObjectMeta)
	}
	if len(role.Rules) != 1 || role.Rules[0].Resources[0] != "pods" {
		t.Errorf("unexpected rules: %+v", role.Rules)
	}
}

func TestBuildRole_RequiresNamespace(t *testing.T) {
	req := CreateRequest{Name: "reader", Rules: []PolicyRuleInput{{Verbs: []string{"get"}}}}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when namespace is missing")
	}
}

func TestBuildRole_RequiresAtLeastOneRule(t *testing.T) {
	req := CreateRequest{Name: "reader", Namespace: "default"}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when no rules are given")
	}
}

func TestBuildRole_RequiresVerbsPerRule(t *testing.T) {
	req := CreateRequest{Name: "reader", Namespace: "default", Rules: []PolicyRuleInput{{Resources: []string{"pods"}}}}
	if _, err := BuildRole(req); err == nil {
		t.Fatal("expected error when a rule has no verbs")
	}
}

func TestBuildClusterRole_Success(t *testing.T) {
	req := CreateRequest{
		Name:  "cluster-reader",
		Rules: []PolicyRuleInput{{Resources: []string{"nodes"}, Verbs: []string{"get"}}},
	}
	cr, err := BuildClusterRole(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cr.Name != "cluster-reader" {
		t.Errorf("unexpected name: %q", cr.Name)
	}
}

func TestBuildClusterRole_AllowsNonResourceURLsRule(t *testing.T) {
	req := CreateRequest{
		Name:  "discovery-reader",
		Rules: []PolicyRuleInput{{NonResourceURLs: []string{"/healthz", "/version"}, Verbs: []string{"get"}}},
	}
	cr, err := BuildClusterRole(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cr.Rules) != 1 || len(cr.Rules[0].NonResourceURLs) != 2 {
		t.Errorf("expected nonResourceURLs to carry through, got: %+v", cr.Rules)
	}
}

func TestBuildClusterRole_RequiresResourcesOrNonResourceURLs(t *testing.T) {
	req := CreateRequest{
		Name:  "broken",
		Rules: []PolicyRuleInput{{Verbs: []string{"get"}}},
	}
	if _, err := BuildClusterRole(req); err == nil {
		t.Fatal("expected error when a rule has neither resources nor nonResourceURLs")
	}
}

func TestBuildRoleBinding_Success(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		RoleRef:   &RoleRefInput{Kind: "Role", Name: "reader"},
		Subjects:  []SubjectInput{{Kind: "ServiceAccount", Name: "builder", Namespace: "default"}},
	}
	rb, err := BuildRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rb.RoleRef.Kind != "Role" || rb.RoleRef.Name != "reader" {
		t.Errorf("unexpected roleRef: %+v", rb.RoleRef)
	}
	if len(rb.Subjects) != 1 || rb.Subjects[0].APIGroup != "" {
		t.Errorf("expected ServiceAccount subject with empty apiGroup, got %+v", rb.Subjects)
	}
}

func TestBuildRoleBinding_UserSubjectGetsRbacAPIGroup(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		RoleRef:   &RoleRefInput{Kind: "Role", Name: "reader"},
		Subjects:  []SubjectInput{{Kind: "User", Name: "alice"}},
	}
	rb, err := BuildRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rb.Subjects[0].APIGroup != "rbac.authorization.k8s.io" {
		t.Errorf("expected rbac.authorization.k8s.io apiGroup for User subject, got %q", rb.Subjects[0].APIGroup)
	}
}

func TestBuildRoleBinding_RequiresRoleRef(t *testing.T) {
	req := CreateRequest{
		Name:      "reader-binding",
		Namespace: "default",
		Subjects:  []SubjectInput{{Kind: "User", Name: "alice"}},
	}
	if _, err := BuildRoleBinding(req); err == nil {
		t.Fatal("expected error when roleRef is missing")
	}
}

func TestBuildClusterRoleBinding_Success(t *testing.T) {
	req := CreateRequest{
		Name:     "cluster-reader-binding",
		RoleRef:  &RoleRefInput{Kind: "ClusterRole", Name: "cluster-reader"},
		Subjects: []SubjectInput{{Kind: "Group", Name: "admins"}},
	}
	crb, err := BuildClusterRoleBinding(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if crb.RoleRef.Name != "cluster-reader" {
		t.Errorf("unexpected roleRef name: %q", crb.RoleRef.Name)
	}
}
