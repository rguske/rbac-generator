import { useEffect, useState } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalVariant,
  TextInput,
} from '@patternfly/react-core';
import { RuleBuilder } from '../components/RuleBuilder';
import { SubjectBuilder } from '../components/SubjectBuilder';
import { YamlToggle } from '../components/YamlToggle';
import { createResource, dryRun, getDiscoveryResources, getServiceAccounts } from '../api/client';
import { isNamespaced, requiresRules, requiresSubjects } from '../types/rbac';
import type { Kind, RbacResource } from '../types/rbac';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'roles', label: 'Role' },
  { value: 'clusterroles', label: 'ClusterRole' },
  { value: 'rolebindings', label: 'RoleBinding' },
  { value: 'clusterrolebindings', label: 'ClusterRoleBinding' },
];

interface CreatePageProps {
  connected: boolean;
}

export function CreatePage({ connected }: CreatePageProps) {
  const [kind, setKind] = useState<Kind>('roles');
  const [resource, setResource] = useState<RbacResource>({ name: '' });
  const [catalog, setCatalog] = useState<{ groups: string[]; resources: string[]; verbs: string[] }>({
    groups: [],
    resources: [],
    verbs: [],
  });
  const [serviceAccounts, setServiceAccounts] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ result?: unknown; error?: string } | null>(null);
  const [dryRunPassed, setDryRunPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiscoveryResources()
      .then((data) => {
        setCatalog({
          groups: Array.from(new Set(data.resources.map((r) => r.group))).sort(),
          resources: Array.from(new Set(data.resources.map((r) => r.resource))).sort(),
          verbs: data.verbs,
        });
      })
      .catch(() => undefined);
  }, [connected]);

  useEffect(() => {
    if (connected && resource.namespace && kind === 'rolebindings') {
      getServiceAccounts(resource.namespace).then(setServiceAccounts).catch(() => setServiceAccounts([]));
    }
  }, [connected, resource.namespace, kind]);

  const handleKindChange = (value: string) => {
    setKind(value as Kind);
    setResource({ name: resource.name });
    setDryRunPassed(false);
    setPreview(null);
  };

  const updateField = <K extends keyof RbacResource>(field: K, fieldValue: RbacResource[K]) => {
    setResource((prev) => ({ ...prev, [field]: fieldValue }));
    setDryRunPassed(false);
  };

  const handleDryRun = async () => {
    setError(null);
    try {
      const result = await dryRun(kind, resource);
      setPreview({ result });
      setDryRunPassed(true);
    } catch (e) {
      setPreview({ error: e instanceof Error ? e.message : 'Dry-run failed' });
      setDryRunPassed(false);
    }
  };

  const handleApply = async () => {
    setError(null);
    try {
      await createResource(kind, resource);
      setPreview(null);
      setDryRunPassed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(resource, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.name || 'resource'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFields = () => (
    <>
      <FormGroup label="Name" fieldId="name" isRequired>
        <TextInput id="name" value={resource.name} onChange={(_e, value) => updateField('name', value)} isRequired />
      </FormGroup>
      {isNamespaced(kind) && (
        <FormGroup label="Namespace" fieldId="namespace" isRequired>
          <TextInput id="namespace" value={resource.namespace ?? ''} onChange={(_e, value) => updateField('namespace', value)} isRequired />
        </FormGroup>
      )}
      {requiresSubjects(kind) && (
        <FormGroup label="Role reference name" fieldId="roleRefName" isRequired>
          <TextInput
            id="roleRefName"
            value={resource.roleRef?.name ?? ''}
            onChange={(_e, value) => updateField('roleRef', { kind: kind === 'rolebindings' ? 'Role' : 'ClusterRole', name: value })}
            isRequired
          />
        </FormGroup>
      )}
      {requiresRules(kind) && (
        <RuleBuilder
          rules={resource.rules ?? []}
          onChange={(rules) => updateField('rules', rules)}
          groupOptions={catalog.groups}
          resourceOptions={catalog.resources}
          verbOptions={catalog.verbs}
        />
      )}
      {requiresSubjects(kind) && (
        <SubjectBuilder subjects={resource.subjects ?? []} onChange={(subjects) => updateField('subjects', subjects)} serviceAccounts={serviceAccounts} />
      )}
    </>
  );

  return (
    <Card>
      <CardBody>
        {error && <Alert variant="danger" title={error} />}
        <Form>
          <FormGroup label="Kind" fieldId="kind">
            <FormSelect id="kind" value={kind} onChange={(_e, value) => handleKindChange(value)}>
              {KIND_OPTIONS.map((opt) => (
                <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </FormSelect>
          </FormGroup>
          <YamlToggle
            value={resource}
            onChange={(newResource) => {
              setResource(newResource);
              setDryRunPassed(false);
            }}
            kind={kind}
            renderForm={renderFields}
          />
          <ActionGroup>
            <Button variant="secondary" onClick={handleDryRun} isDisabled={!connected}>
              Preview &amp; Dry-Run
            </Button>
            <Button variant="primary" onClick={handleApply} isDisabled={!connected || !dryRunPassed}>
              Apply
            </Button>
            <Button variant="link" onClick={handleDownload}>
              Download YAML
            </Button>
          </ActionGroup>
        </Form>
      </CardBody>
      {preview && (
        <Modal variant={ModalVariant.medium} title="Preview" isOpen onClose={() => setPreview(null)}>
          <pre>{JSON.stringify(preview.result ?? { error: preview.error }, null, 2)}</pre>
        </Modal>
      )}
    </Card>
  );
}
