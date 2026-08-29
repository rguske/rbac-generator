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
	Group      string `json:"group"`
	Version    string `json:"version"`
	Resource   string `json:"resource"`
	Kind       string `json:"kind"`
	Namespaced bool   `json:"namespaced"`
}

type ResourcesResponse struct {
	Source    string     `json:"source"`
	Resources []Resource `json:"resources"`
	Verbs     []string   `json:"verbs"`
}

var staticVerbs = []string{"get", "list", "watch", "create", "update", "patch", "delete", "deletecollection", "*"}

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

func StaticVerbs() []string     { return staticVerbs }
func StaticResources() []Resource { return staticResources }

// LiveResources queries cluster API discovery for the current apiGroups
// and resources, skipping subresources (e.g. pods/status).
func LiveResources(disc k8sdiscovery.DiscoveryInterface) ([]Resource, error) {
	_, apiLists, err := disc.ServerGroupsAndResources()
	if len(apiLists) == 0 {
		return nil, err
	}
	var out []Resource
	for _, list := range apiLists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		for _, res := range list.APIResources {
			if strings.Contains(res.Name, "/") {
				continue
			}
			out = append(out, Resource{
				Group:      gv.Group,
				Version:    gv.Version,
				Resource:   res.Name,
				Kind:       res.Kind,
				Namespaced: res.Namespaced,
			})
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
