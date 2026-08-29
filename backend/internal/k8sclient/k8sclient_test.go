// backend/internal/k8sclient/k8sclient_test.go
package k8sclient

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/version"
	"k8s.io/client-go/kubernetes/fake"
	fakediscovery "k8s.io/client-go/discovery/fake"
)

const validKubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://example-cluster.test:6443
    insecure-skip-tls-verify: true
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
current-context: test-context
users:
- name: test-user
  user:
    token: test-token
`

func TestBuildClientset_ValidKubeconfig(t *testing.T) {
	cs, restCfg, currentContext, err := BuildClientset(validKubeconfig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cs == nil {
		t.Fatal("expected non-nil clientset")
	}
	if currentContext != "test-context" {
		t.Errorf("expected currentContext %q, got %q", "test-context", currentContext)
	}
	if restCfg.Host != "https://example-cluster.test:6443" {
		t.Errorf("unexpected host %q", restCfg.Host)
	}
}

func TestBuildClientset_InvalidKubeconfig(t *testing.T) {
	if _, _, _, err := BuildClientset("not: [valid"); err == nil {
		t.Fatal("expected error for invalid kubeconfig")
	}
}

func TestVerifyConnection_Success(t *testing.T) {
	cs := fake.NewSimpleClientset()
	fd := cs.Discovery().(*fakediscovery.FakeDiscovery)
	fd.FakedServerVersion = &version.Info{GitVersion: "v1.30.0"}

	v, err := VerifyConnection(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != "v1.30.0" {
		t.Errorf("expected v1.30.0, got %q", v)
	}
}
