// backend/internal/discovery/identity.go
package discovery

import (
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

// userGVR and groupGVR address OpenShift's user.openshift.io/v1 User and
// Group resources. Vanilla Kubernetes has no API for "all users" or "all
// groups" at all: RBAC Subjects of kind User/Group are just opaque strings
// supplied by whatever authenticates the request (OIDC, client certs,
// webhook tokens, ...), with nothing to list. OpenShift is the exception:
// its identity/OAuth stack syncs real User and Group objects into etcd,
// which it exposes as ordinary (cluster-scoped) custom resources under
// user.openshift.io/v1. On any other cluster, listing these simply fails
// (the API group doesn't exist) and callers fall back to free-text entry.
var (
	userGVR  = schema.GroupVersionResource{Group: "user.openshift.io", Version: "v1", Resource: "users"}
	groupGVR = schema.GroupVersionResource{Group: "user.openshift.io", Version: "v1", Resource: "groups"}
)

func (h *Handler) Users(w http.ResponseWriter, r *http.Request) {
	h.listIdentities(w, r, userGVR)
}

func (h *Handler) Groups(w http.ResponseWriter, r *http.Request) {
	h.listIdentities(w, r, groupGVR)
}

func (h *Handler) listIdentities(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.DynamicClient == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}
	list, err := sess.DynamicClient.Resource(gvr).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		// Most commonly hit on a non-OpenShift cluster, where the
		// user.openshift.io API group doesn't exist at all, or when the
		// connected identity lacks permission to list it. Either way,
		// there's nothing to offer as suggestions; callers (the frontend)
		// fall back to free-text subject-name entry.
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	names := make([]string, 0, len(list.Items))
	for _, item := range list.Items {
		names = append(names, item.GetName())
	}
	httpjson.WriteJSON(w, http.StatusOK, names)
}
