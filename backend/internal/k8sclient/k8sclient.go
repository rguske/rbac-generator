// backend/internal/k8sclient/k8sclient.go
package k8sclient

import (
	"context"
	"fmt"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// BuildClientset parses raw kubeconfig YAML text and builds a clientset
// from it. The raw text is never persisted by this function; callers
// are responsible for discarding it immediately after this call.
func BuildClientset(kubeconfigYAML string) (kubernetes.Interface, *rest.Config, string, error) {
	cfg, err := clientcmd.Load([]byte(kubeconfigYAML))
	if err != nil {
		return nil, nil, "", fmt.Errorf("parse kubeconfig: %w", err)
	}

	restConfig, err := clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		return nil, nil, "", fmt.Errorf("build client config: %w", err)
	}
	restConfig.Timeout = 10 * time.Second

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, "", fmt.Errorf("build clientset: %w", err)
	}

	return clientset, restConfig, cfg.CurrentContext, nil
}

// VerifyConnection performs a lightweight call to confirm the clientset
// can reach a cluster, returning its reported version string.
func VerifyConnection(_ context.Context, cs kubernetes.Interface) (string, error) {
	v, err := cs.Discovery().ServerVersion()
	if err != nil {
		return "", err
	}
	return v.GitVersion, nil
}
