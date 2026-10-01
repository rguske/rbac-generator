import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardTitle,
  Label,
  LabelGroup,
} from '@patternfly/react-core';
import { Gallery, GalleryItem } from '@patternfly/react-core';
import { SearchableSelect } from '../components/SearchableSelect';
import { getNamespaces } from '../api/client';
import type { Kind, RbacResource } from '../types/rbac';
import { RBAC_TEMPLATES } from '../data/templates';
import type { RbacTemplate } from '../data/templates';

interface TemplatesPageProps {
  connected: boolean;
  onUseTemplate: (kind: Kind, resource: RbacResource) => void;
}

type LabelColor = 'blue' | 'teal' | 'green' | 'orange' | 'purple' | 'orangered' | 'grey' | 'yellow';

const GROUP_COLOR_PALETTE: LabelColor[] = ['teal', 'green', 'purple', 'orange', 'yellow', 'orangered', 'grey'];

/**
 * Picks a color for an apiGroup label. "*" (wildcard/full access) always
 * gets red as a visual warning, and the core group always gets blue since
 * it's the most common one; every other group gets a color deterministically
 * derived from its name, so the same group always looks the same across
 * cards without having to hardcode every possible API group.
 */
function colorForGroup(group: string): LabelColor | 'red' | 'blue' {
  if (group === '*') return 'red';
  if (group === 'core') return 'blue';
  let hash = 0;
  for (let i = 0; i < group.length; i += 1) {
    hash = (hash * 31 + group.charCodeAt(i)) >>> 0;
  }
  return GROUP_COLOR_PALETTE[hash % GROUP_COLOR_PALETTE.length];
}

interface TemplateCardProps {
  template: RbacTemplate;
  onUseTemplate: TemplatesPageProps['onUseTemplate'];
  namespaces: string[];
}

function TemplateCard({ template, onUseTemplate, namespaces }: TemplateCardProps) {
  const [namespace, setNamespace] = useState('');

  const ruleSummary = Array.from(
    new Set(
      template.rules.flatMap((rule) =>
        rule.apiGroups.map((group) => (group === '' ? 'core' : group)),
      ),
    ),
  );

  const useAsClusterRole = () => {
    onUseTemplate('clusterroles', { name: template.defaultName, rules: template.rules });
  };

  const useAsRole = () => {
    if (!namespace.trim()) return;
    onUseTemplate('roles', { name: template.defaultName, namespace: namespace.trim(), rules: template.rules });
  };

  return (
    <Card data-testid={`template-card-${template.id}`}>
      <CardTitle>{template.name}</CardTitle>
      <CardBody>
        <p>{template.description}</p>
        <LabelGroup aria-label="API groups covered">
          {ruleSummary.map((group) => (
            <Label key={group} isCompact color={colorForGroup(group)}>
              {group}
            </Label>
          ))}
        </LabelGroup>
      </CardBody>
      <CardFooter>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={useAsClusterRole}>
            Use as ClusterRole
          </Button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <SearchableSelect
              ariaLabel={`${template.name} namespace`}
              placeholder="Namespace"
              value={namespace}
              options={namespaces.map((ns) => ({ value: ns, label: ns }))}
              onChange={setNamespace}
              allowCustomValue
            />
            <Button variant="secondary" onClick={useAsRole} isDisabled={!namespace.trim()}>
              Use as Role
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

export function TemplatesPage({ connected, onUseTemplate }: TemplatesPageProps) {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespacesWarning, setNamespacesWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setNamespaces([]);
      setNamespacesWarning(null);
      return;
    }
    getNamespaces()
      .then((data) => {
        setNamespaces(data);
        setNamespacesWarning(null);
      })
      .catch(() => {
        setNamespaces([]);
        setNamespacesWarning('Failed to load namespaces from the cluster; type the namespace name manually.');
      });
  }, [connected]);

  return (
    <Card>
      <CardBody>
        {namespacesWarning && <Alert variant="warning" title={namespacesWarning} />}
        <p style={{ marginBottom: '1rem' }}>
          Start from a pre-built persona instead of building rules from scratch. Selecting a template opens the Create
          page with the name and rules already filled in — nothing is applied until you dry-run and Apply there.
        </p>
        <Gallery hasGutter minWidths={{ default: '300px' }}>
          {RBAC_TEMPLATES.map((template) => (
            <GalleryItem key={template.id}>
              <TemplateCard template={template} onUseTemplate={onUseTemplate} namespaces={namespaces} />
            </GalleryItem>
          ))}
        </Gallery>
      </CardBody>
    </Card>
  );
}
