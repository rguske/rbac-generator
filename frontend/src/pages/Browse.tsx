import { useEffect, useState } from 'react';
import {
  Alert,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  FormSelect,
  FormSelectOption,
  TextInput,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { getResource, listResources } from '../api/client';
import { toYaml } from '../lib/yamlSync';
import { isNamespaced } from '../types/rbac';
import type { Kind, RbacResource } from '../types/rbac';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'roles', label: 'Role' },
  { value: 'clusterroles', label: 'ClusterRole' },
  { value: 'rolebindings', label: 'RoleBinding' },
  { value: 'clusterrolebindings', label: 'ClusterRoleBinding' },
];

interface BrowsePageProps {
  connected: boolean;
}

export function BrowsePage({ connected }: BrowsePageProps) {
  const [kind, setKind] = useState<Kind>('roles');
  const [namespace, setNamespace] = useState('');
  const [items, setItems] = useState<RbacResource[]>([]);
  const [selected, setSelected] = useState<RbacResource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setItems([]);
      return;
    }
    setSelected(null);
    listResources(kind, isNamespaced(kind) ? namespace || undefined : undefined)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load resources'));
  }, [connected, kind, namespace]);

  const openDetail = async (item: RbacResource) => {
    try {
      const full = await getResource(kind, item.name, item.namespace);
      setSelected(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resource');
    }
  };

  const closeDetail = () => setSelected(null);

  const panel = (
    <DrawerPanelContent>
      <DrawerHead>
        <DrawerActions>
          <DrawerCloseButton onClose={closeDetail} />
        </DrawerActions>
      </DrawerHead>
      {selected && <pre data-testid="yaml-drawer">{toYaml(selected)}</pre>}
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={Boolean(selected)}>
      <DrawerContent panelContent={panel}>
        <DrawerContentBody>
          {error && <Alert variant="danger" title={error} />}
          <FormSelect aria-label="Kind filter" value={kind} onChange={(_e, value) => setKind(value as Kind)}>
            {KIND_OPTIONS.map((opt) => (
              <FormSelectOption key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </FormSelect>
          {isNamespaced(kind) && (
            <TextInput
              aria-label="Namespace filter"
              placeholder="Filter by namespace"
              value={namespace}
              onChange={(_e, value) => setNamespace(value)}
            />
          )}
          <Table aria-label="RBAC resources">
            <Thead>
              <Tr>
                <Th>Name</Th>
                {isNamespaced(kind) && <Th>Namespace</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr
                  key={`${item.namespace ?? ''}/${item.name}`}
                  onClick={() => openDetail(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <Td>{item.name}</Td>
                  {isNamespaced(kind) && <Td>{item.namespace}</Td>}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
}
