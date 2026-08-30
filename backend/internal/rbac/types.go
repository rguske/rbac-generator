// backend/internal/rbac/types.go
package rbac

// Kind identifies which of the four RBAC resource kinds a request targets,
// matching the REST API's {kind} path segment.
type Kind string

const (
	KindRole               Kind = "roles"
	KindClusterRole        Kind = "clusterroles"
	KindRoleBinding        Kind = "rolebindings"
	KindClusterRoleBinding Kind = "clusterrolebindings"
)

type PolicyRuleInput struct {
	APIGroups []string `json:"apiGroups"`
	Resources []string `json:"resources"`
	Verbs     []string `json:"verbs"`
	// ResourceNames restricts a rule to specific named objects.
	ResourceNames []string `json:"resourceNames,omitempty"`
	// NonResourceURLs grants access to non-resource HTTP paths, e.g.
	// "/healthz" or "/api/*". Only valid on ClusterRoles, and mutually
	// exclusive with APIGroups/Resources on the same rule.
	NonResourceURLs []string `json:"nonResourceURLs,omitempty"`
}

type SubjectInput struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

type RoleRefInput struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type CreateRequest struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace,omitempty"`
	Rules     []PolicyRuleInput `json:"rules,omitempty"`
	Subjects  []SubjectInput    `json:"subjects,omitempty"`
	RoleRef   *RoleRefInput     `json:"roleRef,omitempty"`
}
