// backend/internal/rbac/builders.go
package rbac

import (
	"fmt"

	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func BuildRole(req CreateRequest) (*rbacv1.Role, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Namespace == "" {
		return nil, fmt.Errorf("namespace is required for Role")
	}
	rules, err := buildPolicyRules(req.Rules)
	if err != nil {
		return nil, err
	}
	return &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name, Namespace: req.Namespace},
		Rules:      rules,
	}, nil
}

func BuildClusterRole(req CreateRequest) (*rbacv1.ClusterRole, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	rules, err := buildPolicyRules(req.Rules)
	if err != nil {
		return nil, err
	}
	return &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name},
		Rules:      rules,
	}, nil
}

func BuildRoleBinding(req CreateRequest) (*rbacv1.RoleBinding, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Namespace == "" {
		return nil, fmt.Errorf("namespace is required for RoleBinding")
	}
	if req.RoleRef == nil || req.RoleRef.Name == "" {
		return nil, fmt.Errorf("roleRef is required")
	}
	subjects, err := buildSubjects(req.Subjects)
	if err != nil {
		return nil, err
	}
	return &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name, Namespace: req.Namespace},
		RoleRef: rbacv1.RoleRef{
			APIGroup: rbacv1.GroupName,
			Kind:     req.RoleRef.Kind,
			Name:     req.RoleRef.Name,
		},
		Subjects: subjects,
	}, nil
}

func BuildClusterRoleBinding(req CreateRequest) (*rbacv1.ClusterRoleBinding, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.RoleRef == nil || req.RoleRef.Name == "" {
		return nil, fmt.Errorf("roleRef is required")
	}
	subjects, err := buildSubjects(req.Subjects)
	if err != nil {
		return nil, err
	}
	return &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: req.Name},
		RoleRef: rbacv1.RoleRef{
			APIGroup: rbacv1.GroupName,
			Kind:     req.RoleRef.Kind,
			Name:     req.RoleRef.Name,
		},
		Subjects: subjects,
	}, nil
}

func buildPolicyRules(inputs []PolicyRuleInput) ([]rbacv1.PolicyRule, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("at least one rule is required")
	}
	rules := make([]rbacv1.PolicyRule, 0, len(inputs))
	for i, in := range inputs {
		if len(in.Verbs) == 0 {
			return nil, fmt.Errorf("rule %d: at least one verb is required", i)
		}
		rules = append(rules, rbacv1.PolicyRule{
			APIGroups:     in.APIGroups,
			Resources:     in.Resources,
			Verbs:         in.Verbs,
			ResourceNames: in.ResourceNames,
		})
	}
	return rules, nil
}

func buildSubjects(inputs []SubjectInput) ([]rbacv1.Subject, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("at least one subject is required")
	}
	subjects := make([]rbacv1.Subject, 0, len(inputs))
	for i, in := range inputs {
		if in.Kind == "" || in.Name == "" {
			return nil, fmt.Errorf("subject %d: kind and name are required", i)
		}
		apiGroup := rbacv1.GroupName
		if in.Kind == rbacv1.ServiceAccountKind {
			apiGroup = ""
		}
		subjects = append(subjects, rbacv1.Subject{
			Kind:      in.Kind,
			Name:      in.Name,
			Namespace: in.Namespace,
			APIGroup:  apiGroup,
		})
	}
	return subjects, nil
}

// ResourceResponse is the flat shape returned by List/Get, matching the
// frontend's RbacResource type field-for-field (see frontend/src/types/rbac.ts).
type ResourceResponse = CreateRequest

// RoleToResource converts a live rbacv1.Role back into the flat response
// shape the frontend expects, mirroring what BuildRole constructs.
func RoleToResource(obj *rbacv1.Role) ResourceResponse {
	return ResourceResponse{
		Name:      obj.Name,
		Namespace: obj.Namespace,
		Rules:     policyRulesToInputs(obj.Rules),
	}
}

// ClusterRoleToResource converts a live rbacv1.ClusterRole back into the
// flat response shape the frontend expects.
func ClusterRoleToResource(obj *rbacv1.ClusterRole) ResourceResponse {
	return ResourceResponse{
		Name:  obj.Name,
		Rules: policyRulesToInputs(obj.Rules),
	}
}

// RoleBindingToResource converts a live rbacv1.RoleBinding back into the
// flat response shape the frontend expects.
func RoleBindingToResource(obj *rbacv1.RoleBinding) ResourceResponse {
	return ResourceResponse{
		Name:      obj.Name,
		Namespace: obj.Namespace,
		Subjects:  subjectsToInputs(obj.Subjects),
		RoleRef:   &RoleRefInput{Kind: obj.RoleRef.Kind, Name: obj.RoleRef.Name},
	}
}

// ClusterRoleBindingToResource converts a live rbacv1.ClusterRoleBinding
// back into the flat response shape the frontend expects.
func ClusterRoleBindingToResource(obj *rbacv1.ClusterRoleBinding) ResourceResponse {
	return ResourceResponse{
		Name:     obj.Name,
		Subjects: subjectsToInputs(obj.Subjects),
		RoleRef:  &RoleRefInput{Kind: obj.RoleRef.Kind, Name: obj.RoleRef.Name},
	}
}

func policyRulesToInputs(rules []rbacv1.PolicyRule) []PolicyRuleInput {
	out := make([]PolicyRuleInput, 0, len(rules))
	for _, r := range rules {
		out = append(out, PolicyRuleInput{
			APIGroups:     r.APIGroups,
			Resources:     r.Resources,
			Verbs:         r.Verbs,
			ResourceNames: r.ResourceNames,
		})
	}
	return out
}

func subjectsToInputs(subjects []rbacv1.Subject) []SubjectInput {
	out := make([]SubjectInput, 0, len(subjects))
	for _, s := range subjects {
		out = append(out, SubjectInput{Kind: s.Kind, Name: s.Name, Namespace: s.Namespace})
	}
	return out
}
