package connection

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"rbac-generator/internal/httpjson"
	"rbac-generator/internal/k8sclient"
	"rbac-generator/internal/session"
)

type ConnectRequest struct {
	Kubeconfig string `json:"kubeconfig"`
}

type ConnectResponse struct {
	Server         string `json:"server"`
	Version        string `json:"version"`
	CurrentContext string `json:"currentContext"`
}

type buildClientsetFunc func(string) (kubernetes.Interface, *rest.Config, string, error)
type verifyFunc func(context.Context, kubernetes.Interface) (string, error)

type Handler struct {
	buildClientset buildClientsetFunc
	verify         verifyFunc
}

func NewHandler() *Handler {
	return &Handler{buildClientset: k8sclient.BuildClientset, verify: k8sclient.VerifyConnection}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Kubeconfig) == "" {
		httpjson.WriteError(w, http.StatusBadRequest, "kubeconfig is required")
		return
	}

	cs, restCfg, currentContext, err := h.buildClientset(req.Kubeconfig)
	req.Kubeconfig = "" // discard raw kubeconfig text as soon as it has been parsed
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid kubeconfig: "+err.Error())
		return
	}

	version, err := h.verify(r.Context(), cs)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadGateway, "could not reach cluster: "+err.Error())
		return
	}

	sess.Clientset = cs
	sess.ClusterInfo = &session.ClusterInfo{Server: restCfg.Host, Version: version, CurrentContext: currentContext}

	httpjson.WriteJSON(w, http.StatusOK, ConnectResponse{Server: restCfg.Host, Version: version, CurrentContext: currentContext})
}

func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	sess, ok := session.FromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sess.Clientset = nil
	sess.ClusterInfo = nil
	w.WriteHeader(http.StatusNoContent)
}
