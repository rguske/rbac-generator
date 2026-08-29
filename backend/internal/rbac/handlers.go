// backend/internal/rbac/handlers.go
package rbac

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/session"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) DryRun(w http.ResponseWriter, r *http.Request) {
	h.handleWrite(w, r, true)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	h.handleWrite(w, r, false)
}

func (h *Handler) handleWrite(w http.ResponseWriter, r *http.Request, dryRun bool) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	ctx := r.Context()
	opts := metav1.CreateOptions{}
	if dryRun {
		opts.DryRun = []string{metav1.DryRunAll}
	}

	var result interface{}
	var err error

	switch kind {
	case KindRole:
		obj, buildErr := BuildRole(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().Roles(req.Namespace).Create(ctx, obj, opts)
	case KindClusterRole:
		obj, buildErr := BuildClusterRole(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().ClusterRoles().Create(ctx, obj, opts)
	case KindRoleBinding:
		obj, buildErr := BuildRoleBinding(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().RoleBindings(req.Namespace).Create(ctx, obj, opts)
	case KindClusterRoleBinding:
		obj, buildErr := BuildClusterRoleBinding(req)
		if buildErr != nil {
			httpjson.WriteError(w, http.StatusBadRequest, buildErr.Error())
			return
		}
		result, err = sess.Clientset.RbacV1().ClusterRoleBindings().Create(ctx, obj, opts)
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
		return
	}

	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpjson.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	namespace := r.URL.Query().Get("namespace")
	ctx := r.Context()

	switch kind {
	case KindRole:
		list, err := sess.Clientset.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		items := make([]ResourceResponse, 0, len(list.Items))
		for i := range list.Items {
			items = append(items, RoleToResource(&list.Items[i]))
		}
		httpjson.WriteJSON(w, http.StatusOK, items)
	case KindClusterRole:
		list, err := sess.Clientset.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		items := make([]ResourceResponse, 0, len(list.Items))
		for i := range list.Items {
			items = append(items, ClusterRoleToResource(&list.Items[i]))
		}
		httpjson.WriteJSON(w, http.StatusOK, items)
	case KindRoleBinding:
		list, err := sess.Clientset.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		items := make([]ResourceResponse, 0, len(list.Items))
		for i := range list.Items {
			items = append(items, RoleBindingToResource(&list.Items[i]))
		}
		httpjson.WriteJSON(w, http.StatusOK, items)
	case KindClusterRoleBinding:
		list, err := sess.Clientset.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		items := make([]ResourceResponse, 0, len(list.Items))
		for i := range list.Items {
			items = append(items, ClusterRoleBindingToResource(&list.Items[i]))
		}
		httpjson.WriteJSON(w, http.StatusOK, items)
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
	}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok || sess.Clientset == nil {
		httpjson.WriteError(w, http.StatusConflict, "not connected to a cluster")
		return
	}

	kind := Kind(chi.URLParam(r, "kind"))
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	ctx := r.Context()

	switch kind {
	case KindRole:
		obj, err := sess.Clientset.RbacV1().Roles(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, RoleToResource(obj))
	case KindClusterRole:
		obj, err := sess.Clientset.RbacV1().ClusterRoles().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, ClusterRoleToResource(obj))
	case KindRoleBinding:
		obj, err := sess.Clientset.RbacV1().RoleBindings(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, RoleBindingToResource(obj))
	case KindClusterRoleBinding:
		obj, err := sess.Clientset.RbacV1().ClusterRoleBindings().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			httpjson.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, ClusterRoleBindingToResource(obj))
	default:
		httpjson.WriteError(w, http.StatusNotFound, "unknown kind")
	}
}
