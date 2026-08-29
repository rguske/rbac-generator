// frontend/src/pages/Connection.tsx
import { useState } from 'react';
import { ActionGroup, Alert, Button, Card, CardBody, CardTitle, Form, FormGroup, TextArea } from '@patternfly/react-core';
import { connect, disconnect } from '../api/client';
import type { ClusterInfo } from '../types/rbac';

interface ConnectionPageProps {
  clusterInfo?: ClusterInfo;
  onConnected: (info: ClusterInfo) => void;
  onDisconnected: () => void;
}

export function ConnectionPage({ clusterInfo, onConnected, onDisconnected }: ConnectionPageProps) {
  const [kubeconfig, setKubeconfig] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleConnect = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const info = await connect(kubeconfig);
      onConnected(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnected();
  };

  if (clusterInfo) {
    return (
      <Card>
        <CardTitle>Connected</CardTitle>
        <CardBody>
          <p>{clusterInfo.server}</p>
          <p>Version: {clusterInfo.version}</p>
          <p>Context: {clusterInfo.currentContext}</p>
          <Button variant="danger" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Connect to a cluster</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title={error} />}
        <Form>
          <FormGroup label="Kubeconfig" fieldId="kubeconfig">
            <TextArea
              id="kubeconfig"
              aria-label="kubeconfig-text"
              value={kubeconfig}
              onChange={(_e, value) => setKubeconfig(value)}
              rows={10}
              placeholder="Paste your kubeconfig YAML here"
            />
          </FormGroup>
          <ActionGroup>
            <Button variant="primary" onClick={handleConnect} isDisabled={submitting || !kubeconfig.trim()}>
              Connect
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
    </Card>
  );
}
