import { useEffect, useState } from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalVariant,
  TextInput,
} from '@patternfly/react-core';
import { EraserIcon } from '@patternfly/react-icons';
import { RuleBuilder } from '../components/RuleBuilder';
import { SubjectBuilder } from '../components/SubjectBuilder';
import { FormYamlSplit } from '../components/FormYamlSplit';
import { FieldHelp } from '../components/FieldHelp';
import { createResource, dryRun, getDiscoveryResources, getServiceAccounts } from '../api/client';
import { isNamespaced, requiresRules, requiresSubjects } from '../types/rbac';
import type { Kind, RbacResource, DiscoveryResource } from '../types/rbac';
import { toYaml } from '../lib/yamlSync';

const DEFAULT_KIND: Kind = 'roles';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'roles', label: 'Role' },
  { value: 'clusterroles', label: 'ClusterRole' },
  { value: 'rolebindings', label: 'RoleBinding' },
  { value: 'clusterrolebindings', label: 'ClusterRoleBinding' },
];

interface CreatePageProps {
  connected: boolean;
  initialKind?: Kind;
  initialResource?: RbacResource;
}

export function CreatePage({ connected, initialKind, initialResource }: CreatePageProps) {
  const [kind, setKind] = useState<Kind>(initialKind ?? DEFAULT_KIND);
  const [resource, setResource] = useState<RbacResource>(initialResource ?? { name: '' });
  const [catalog, setCatalog] = useState<{ groups: string[]; resources: DiscoveryResource[]; verbs: string[] }>({
    groups: [],
    resources: [],
    verbs: [],
  });
  const [serviceAccounts, setServiceAccounts] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ result?: unknown; error?: string } | null>(null);
  const [dryRunPassed, setDryRunPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [serviceAccountsWarning, setServiceAccountsWarning] = useState<string | null>(null);

  useEffect(() => {
    getDiscoveryResources()
      .then((data) => {
        // Discovery can list the same (group, resource) more than once
        // across API versions (e.g. "apps/v1" and "apps/v1beta1" both
        // exposing "deployments") — dedupe so the dropdown doesn't show
        // duplicate options.
        const byKey = new Map<string, DiscoveryResource>();
        for (const r of data.resources) {
          byKey.set(`${r.group}/${r.resource}`, r);
        }
        const resources = Array.from(byKey.values());
        setCatalog({
          groups: Array.from(new Set(resources.map((r) => r.group))).sort(),
          resources,
          verbs: data.verbs,
        });
        setCatalogWarning(null);
      })
      .catch(() => setCatalogWarning('Failed to load the resource catalog; autocomplete suggestions will be unavailable.'));
  }, [connected]);

  useEffect(() => {
    if (connected && resource.namespace && kind === 'rolebindings') {
      getServiceAccounts(resource.namespace)
        .then((accounts) => {
          setServiceAccounts(accounts);
          setServiceAccountsWarning(null);
        })
        .catch(() => {
          setServiceAccounts([]);
          setServiceAccountsWarning('Failed to load service accounts for this namespace; enter the name manually.');
        });
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

  const handleReset = () => {
    setKind(DEFAULT_KIND);
    setResource({ name: '' });
    setPreview(null);
    setDryRunPassed(false);
    setError(null);
  };

  const handleDownload = () => {
    const blob = new Blob([toYaml(resource)], { type: 'application/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.name || 'resource'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFields = () => (
    <>
      <FormSection title="General">
        <FormGroup label="Kind" fieldId="kind">
          <FormSelect id="kind" value={kind} onChange={(_e, value) => handleKindChange(value)}>
            {KIND_OPTIONS.map((opt) => (
              <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup
          label="Name"
          fieldId="name"
          isRequired
          labelHelp={
            <FieldHelp label="Name">
              The resource's name. Must be a valid Kubernetes name (lowercase alphanumeric characters, "-", or ".").
            </FieldHelp>
          }
        >
          <TextInput id="name" value={resource.name} onChange={(_e, value) => updateField('name', value)} isRequired />
        </FormGroup>
        {isNamespaced(kind) && (
          <FormGroup
            label="Namespace"
            fieldId="namespace"
            isRequired
            labelHelp={
              <FieldHelp label="Namespace">
                The namespace this resource applies to. Must be an existing namespace on the connected cluster, e.g.
                "default".
              </FieldHelp>
            }
          >
            <TextInput id="namespace" value={resource.namespace ?? ''} onChange={(_e, value) => updateField('namespace', value)} isRequired />
          </FormGroup>
        )}
      </FormSection>
      {requiresSubjects(kind) && (
        <FormSection title="Role reference">
          <FormGroup
            label="Role reference name"
            fieldId="roleRefName"
            isRequired
            labelHelp={
              <FieldHelp label="Role reference name">
                The name of the existing {kind === 'rolebindings' ? 'Role' : 'ClusterRole'} this binding grants. It
                must already exist on the cluster.
              </FieldHelp>
            }
          >
            <TextInput
              id="roleRefName"
              value={resource.roleRef?.name ?? ''}
              onChange={(_e, value) => updateField('roleRef', { kind: kind === 'rolebindings' ? 'Role' : 'ClusterRole', name: value })}
              isRequired
            />
          </FormGroup>
        </FormSection>
      )}
      {requiresRules(kind) && (
        <FormSection title="Rules">
          <RuleBuilder
            rules={resource.rules ?? []}
            onChange={(rules) => updateField('rules', rules)}
            groupOptions={catalog.groups}
            resourceCatalog={catalog.resources}
            verbOptions={catalog.verbs}
          />
        </FormSection>
      )}
      {requiresSubjects(kind) && (
        <FormSection
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Subjects
              <FieldHelp label="Subjects">
                Who this binding grants the role to. Kind: ServiceAccount (pick from the connected namespace), User,
                or Group. Name: the subject's exact name. Namespace: only needed for ServiceAccount subjects, and
                must match the ServiceAccount's own namespace.
              </FieldHelp>
            </span>
          }
        >
          <SubjectBuilder subjects={resource.subjects ?? []} onChange={(subjects) => updateField('subjects', subjects)} serviceAccounts={serviceAccounts} />
        </FormSection>
      )}
    </>
  );

  return (
    <Card>
      <CardBody>
        {error && <Alert variant="danger" title={error} />}
        {catalogWarning && <Alert variant="warning" title={catalogWarning} />}
        {serviceAccountsWarning && <Alert variant="warning" title={serviceAccountsWarning} />}
        <Form>
          <FormYamlSplit
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
            <Button variant="link" icon={<EraserIcon />} onClick={handleReset}>
              Reset
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
