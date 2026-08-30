// frontend/src/pages/Connection.tsx
import { useState } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  ClipboardCopy,
  ClipboardCopyVariant,
  DropzoneErrorCode,
  FileUpload,
  Form,
  FormGroup,
  TextArea,
} from '@patternfly/react-core';
import type { DropEvent } from '@patternfly/react-core';
import { connect, disconnect } from '../api/client';
import type { ClusterInfo } from '../types/rbac';

const KUBECONFIG_ACCEPT = {
  'application/x-yaml': ['.yaml', '.yml'],
  'text/yaml': ['.yaml', '.yml'],
  'text/x-yaml': ['.yaml', '.yml'],
} as const;

const MAX_KUBECONFIG_FILE_BYTES = 1024 * 1024;

const KUBECONFIG_FILE_TOO_LARGE_ERROR = `Kubeconfig file is too large. Maximum size is ${MAX_KUBECONFIG_FILE_BYTES / (1024 * 1024)} MB.`;

function isKubeconfigFileTooLarge(file: File): boolean {
  return file.size > MAX_KUBECONFIG_FILE_BYTES;
}

interface ConnectionPageProps {
  clusterInfo?: ClusterInfo;
  onConnected: (info: ClusterInfo) => void;
  onDisconnected: () => void;
}

export function ConnectionPage({ clusterInfo, onConnected, onDisconnected }: ConnectionPageProps) {
  const [kubeconfig, setKubeconfig] = useState('');
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);
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

  const handleKubeconfigTextChange = (_event: React.FormEvent<HTMLTextAreaElement>, value: string) => {
    setKubeconfig(value);
    if (uploadedFilename) {
      setUploadedFilename('');
    }
  };

  const handleOversizedKubeconfigFile = () => {
    setError(KUBECONFIG_FILE_TOO_LARGE_ERROR);
    setKubeconfig('');
    setUploadedFilename('');
  };

  const handleFileInputChange = (_event: DropEvent, file: File) => {
    if (isKubeconfigFileTooLarge(file)) {
      handleOversizedKubeconfigFile();
      return;
    }

    setUploadedFilename(file.name);
    setError(null);
  };

  const handleFileDropRejected = (
    rejectedFiles: { errors: readonly { code: string }[] }[],
    _event: DropEvent,
  ) => {
    const tooLarge = rejectedFiles.some((rejection) =>
      rejection.errors.some((error) => error.code === DropzoneErrorCode.FileTooLarge),
    );

    if (tooLarge) {
      handleOversizedKubeconfigFile();
    }
  };

  const handleFileDataChange = (_event: DropEvent, data: string) => {
    setKubeconfig(data);
  };

  const handleFileReadFailed = () => {
    setError('Failed to read kubeconfig file');
    setKubeconfig('');
    setUploadedFilename('');
  };

  const handleFileClear = () => {
    setUploadedFilename('');
    setKubeconfig('');
    setError(null);
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
        <Alert
          variant="info"
          isInline
          title="Managing multiple clusters or contexts?"
          style={{ marginBottom: '1rem' }}
        >
          <p>
            Your default kubeconfig may reference several clusters. Export just the{' '}
            <strong>current context</strong> so you connect to the right one:
          </p>
          <ClipboardCopy
            isReadOnly
            isCode
            hoverTip="Copy"
            clickTip="Copied"
            copyAriaLabel="Copy oc export command"
            variant={ClipboardCopyVariant.inline}
          >
            oc config view --raw --minify &gt; kubeconfig.yaml
          </ClipboardCopy>
          <br />
          <ClipboardCopy
            isReadOnly
            isCode
            hoverTip="Copy"
            clickTip="Copied"
            copyAriaLabel="Copy kubectl export command"
            variant={ClipboardCopyVariant.inline}
          >
            kubectl config view --raw --minify &gt; kubeconfig.yaml
          </ClipboardCopy>
          <p style={{ marginTop: '0.5rem' }}>Then paste its contents or upload it below.</p>
        </Alert>
        <Form>
          <FormGroup label="Kubeconfig" fieldId="kubeconfig">
            <TextArea
              id="kubeconfig"
              aria-label="kubeconfig-text"
              value={kubeconfig}
              onChange={handleKubeconfigTextChange}
              rows={10}
              placeholder="Paste your kubeconfig YAML here"
            />
          </FormGroup>
          <FormGroup label="Or upload a kubeconfig file" fieldId="kubeconfig-upload">
            <FileUpload
              id="kubeconfig-upload"
              type="text"
              hideDefaultPreview
              value=""
              filename={uploadedFilename}
              filenamePlaceholder="Drag and drop a .yaml or .yml file, or browse to upload"
              filenameAriaLabel="Selected kubeconfig file name"
              browseButtonText="Browse..."
              aria-label="kubeconfig-file"
              onFileInputChange={handleFileInputChange}
              onDataChange={handleFileDataChange}
              onReadStarted={() => setIsFileLoading(true)}
              onReadFinished={() => setIsFileLoading(false)}
              onReadFailed={handleFileReadFailed}
              onClearClick={handleFileClear}
              isLoading={isFileLoading}
              isClearButtonDisabled={!uploadedFilename}
              dropzoneProps={{
                accept: KUBECONFIG_ACCEPT,
                maxSize: MAX_KUBECONFIG_FILE_BYTES,
                onDropRejected: handleFileDropRejected,
              }}
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
