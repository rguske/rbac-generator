// frontend/src/components/RuleBuilder.tsx
import { useRef, useState } from 'react';
import { Button, Label, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { DiscoveryResource, PolicyRule } from '../types/rbac';
import { FieldHelp } from './FieldHelp';
import { SearchableSelect } from './SearchableSelect';

interface RuleBuilderProps {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
  resourceCatalog?: DiscoveryResource[];
  groupOptions?: string[];
  verbOptions?: string[];
}

interface ChipMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  helpText?: string;
}

function ChipMultiSelect({ label, values, options, onChange, helpText }: ChipMultiSelectProps) {
  const [pending, setPending] = useState('');

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setPending('');
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div data-testid={`multiselect-${label}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
        <strong>{label}</strong>
        {helpText && <FieldHelp label={label}>{helpText}</FieldHelp>}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <Label
            key={value}
            color="blue"
            isCompact
            onClose={() => removeValue(value)}
            closeBtnAriaLabel={`remove-${label}-${value}`}
          >
            {value}
          </Label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {options.length > 0 && (
          <SearchableSelect
            ariaLabel={`add-${label}`}
            placeholder={`Add ${label}...`}
            value=""
            options={options.filter((o) => !values.includes(o)).map((option) => ({ value: option, label: option }))}
            onChange={addValue}
          />
        )}
        <TextInput
          aria-label={`custom-${label}`}
          placeholder={`Custom ${label}`}
          value={pending}
          onChange={(_e, value) => setPending(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue(pending);
            }
          }}
        />
        <Button variant="plain" aria-label={`add-custom-${label}`} onClick={() => addValue(pending)}>
          <PlusCircleIcon />
        </Button>
      </div>
    </div>
  );
}

interface ResourcePickerProps {
  values: string[];
  catalog: DiscoveryResource[];
  selectedGroups: string[];
  onChange: (values: string[]) => void;
}

function ResourcePicker({ values, catalog, selectedGroups, onChange }: ResourcePickerProps) {
  const [selectedResource, setSelectedResource] = useState('');
  const [selectedSubResource, setSelectedSubResource] = useState('');
  const [pending, setPending] = useState('');

  const filtered = selectedGroups.length > 0 ? catalog.filter((entry) => selectedGroups.includes(entry.group)) : catalog;
  const currentEntry = filtered.find((entry) => entry.resource === selectedResource);
  const subResourceOptions = currentEntry?.subResources ?? [];

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
  };

  const removeValue = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  const handleResourceSelect = (value: string) => {
    setSelectedResource(value);
    setSelectedSubResource('');
  };

  const handlePickerAdd = () => {
    if (!selectedResource) return;
    const combined = selectedSubResource ? `${selectedResource}/${selectedSubResource}` : selectedResource;
    addValue(combined);
    setSelectedResource('');
    setSelectedSubResource('');
  };

  return (
    <div data-testid="multiselect-resources">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
        <strong>resources</strong>
        <FieldHelp label="resources">
          The resource type(s) this rule applies to, e.g. pods, deployments. Custom-resource (CRD-backed) types are
          labeled accordingly.
        </FieldHelp>
        <span style={{ marginLeft: '0.5rem' }} />
        <strong>subResource</strong>
        <FieldHelp label="subResource">
          Optional. A specific sub-endpoint of the chosen resource, e.g. "log" or "status" for pods. Leave as
          "— none —" to grant access to the resource itself.
        </FieldHelp>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <Label
            key={value}
            color="blue"
            isCompact
            onClose={() => removeValue(value)}
            closeBtnAriaLabel={`remove-resources-${value}`}
          >
            {value}
          </Label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {filtered.length > 0 && (
          <SearchableSelect
            ariaLabel="add-resources"
            placeholder="Add resource..."
            value={selectedResource}
            options={filtered.map((entry) => ({
              value: entry.resource,
              label: entry.isCustomResource ? `${entry.resource} (Custom Resource)` : entry.resource,
            }))}
            onChange={handleResourceSelect}
          />
        )}
        {selectedResource && subResourceOptions.length > 0 && (
          <>
            <span>/</span>
            <SearchableSelect
              ariaLabel="add-subresource"
              placeholder="— none —"
              value={selectedSubResource}
              options={subResourceOptions.map((sub) => ({ value: sub, label: sub }))}
              onChange={setSelectedSubResource}
            />
          </>
        )}
        {selectedResource && (
          <Button variant="secondary" onClick={handlePickerAdd}>
            Add
          </Button>
        )}
        <TextInput
          aria-label="custom-resources"
          placeholder="Custom resources"
          value={pending}
          onChange={(_e, value) => setPending(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue(pending);
              setPending('');
            }
          }}
        />
        <Button
          variant="plain"
          aria-label="add-custom-resources"
          onClick={() => {
            addValue(pending);
            setPending('');
          }}
        >
          <PlusCircleIcon />
        </Button>
      </div>
    </div>
  );
}

export function RuleBuilder({ rules, onChange, resourceCatalog = [], groupOptions = [], verbOptions = [] }: RuleBuilderProps) {
  const objectKeysRef = useRef(new WeakMap<object, number>());
  const nextKeyRef = useRef(0);

  const getObjectKey = (obj: object) => {
    const map = objectKeysRef.current;
    let key = map.get(obj);
    if (key === undefined) {
      key = nextKeyRef.current++;
      map.set(obj, key);
    }
    return key;
  };

  const updateRule = (index: number, field: keyof PolicyRule, values: string[]) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, [field]: values } : rule)));
  };

  const addRule = () => {
    onChange([...rules, { apiGroups: [], resources: [], verbs: [] }]);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="rule-builder">
      {rules.map((rule, index) => (
        <div key={getObjectKey(rule)} data-testid={`rule-row-${index}`} style={{ border: '1px solid #ccc', padding: '0.5rem', marginBottom: '0.5rem' }}>
          <ChipMultiSelect
            label="apiGroups"
            values={rule.apiGroups}
            options={groupOptions}
            onChange={(v) => updateRule(index, 'apiGroups', v)}
            helpText='The API group(s) this rule applies to. Use the empty/core option for built-ins like pods and services, or a group like "apps" for Deployments.'
          />
          <ResourcePicker
            values={rule.resources}
            catalog={resourceCatalog}
            selectedGroups={rule.apiGroups}
            onChange={(v) => updateRule(index, 'resources', v)}
          />
          <ChipMultiSelect
            label="verbs"
            values={rule.verbs}
            options={verbOptions}
            onChange={(v) => updateRule(index, 'verbs', v)}
            helpText="The actions this rule allows, e.g. get, list, watch."
          />
          {rule.nonResourceURLs && (
            <ChipMultiSelect
              label="nonResourceURLs"
              values={rule.nonResourceURLs}
              options={[]}
              onChange={(v) => updateRule(index, 'nonResourceURLs', v)}
              helpText='Non-resource HTTP paths this rule grants access to, e.g. "/healthz" or "/api/*". Only valid on ClusterRoles, and used instead of apiGroups/resources.'
            />
          )}
          <Button variant="plain" aria-label={`remove-rule-${index}`} onClick={() => removeRule(index)}>
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addRule}>
        Add rule
      </Button>
    </div>
  );
}
