package connection

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"

	"rbac-generator/internal/session"
)

func fakeBuildOK(kubeconfig string) (kubernetes.Interface, *rest.Config, string, error) {
	if kubeconfig == "bad" {
		return nil, nil, "", errors.New("boom")
	}
	return fake.NewSimpleClientset(), &rest.Config{Host: "https://fake.test:6443"}, "fake-context", nil
}

func fakeVerifyOK(_ context.Context, _ kubernetes.Interface) (string, error) {
	return "v1.30.0", nil
}

func fakeVerifyFail(_ context.Context, _ kubernetes.Interface) (string, error) {
	return "", errors.New("unreachable")
}

func requestWithSession(body []byte) (*http.Request, *session.Session) {
	sess := &session.Session{ID: "s1", Authenticated: true}
	req := httptest.NewRequest(http.MethodPost, "/api/connection", bytes.NewReader(body))
	return req.WithContext(session.NewContext(req.Context(), sess)), sess
}

func TestConnect_Success(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "good"})
	req, sess := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if sess.Clientset == nil {
		t.Fatal("expected clientset to be stored on the session")
	}
	if sess.ClusterInfo.Version != "v1.30.0" {
		t.Errorf("expected version v1.30.0, got %q", sess.ClusterInfo.Version)
	}
}

func TestConnect_InvalidKubeconfig(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "bad"})
	req, _ := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestConnect_UnreachableCluster(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyFail}
	body, _ := json.Marshal(ConnectRequest{Kubeconfig: "good"})
	req, _ := requestWithSession(body)
	rec := httptest.NewRecorder()

	h.Connect(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rec.Code)
	}
}

func TestDisconnect_ClearsSession(t *testing.T) {
	h := &Handler{buildClientset: fakeBuildOK, verify: fakeVerifyOK}
	sess := &session.Session{ID: "s1", Authenticated: true, Clientset: fake.NewSimpleClientset(), ClusterInfo: &session.ClusterInfo{Server: "x"}}
	req := httptest.NewRequest(http.MethodDelete, "/api/connection", nil)
	req = req.WithContext(session.NewContext(req.Context(), sess))
	rec := httptest.NewRecorder()

	h.Disconnect(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if sess.Clientset != nil || sess.ClusterInfo != nil {
		t.Fatal("expected session to be cleared")
	}
}
