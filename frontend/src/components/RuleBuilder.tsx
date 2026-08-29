// frontend/src/components/RuleBuilder.tsx
import { useState } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { PolicyRule } from '../types/rbac';

interface RuleBuilderProps {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
  resourceOptions?: string[];
  groupOptions?: string[];
  verbOptions?: string[];
}

interface ChipMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}

function ChipMultiSelect({ label, values, options, onChange }: ChipMultiSelectProps) {
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
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
        {values.map((value) => (
          <span key={value} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0 0.25rem' }}>
            {value}
            <button type="button" aria-label={`remove-${label}-${value}`} onClick={() => removeValue(value)}>
              &times;
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {options.length > 0 && (
          <FormSelect aria-label={`add-${label}`} value="" onChange={(_e, value) => addValue(value)}>
            <FormSelectOption key="" value="" label={`Add ${label}...`} />
            {options.filter((o) => !values.includes(o)).map((option) => (
              <FormSelectOption key={option} value={option} label={option} />
            ))}
          </FormSelect>
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

export function RuleBuilder({ rules, onChange, resourceOptions = [], groupOptions = [], verbOptions = [] }: RuleBuilderProps) {
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
        <div key={index} data-testid={`rule-row-${index}`} style={{ border: '1px solid #ccc', padding: '0.5rem', marginBottom: '0.5rem' }}>
          <ChipMultiSelect label="apiGroups" values={rule.apiGroups} options={groupOptions} onChange={(v) => updateRule(index, 'apiGroups', v)} />
          <ChipMultiSelect label="resources" values={rule.resources} options={resourceOptions} onChange={(v) => updateRule(index, 'resources', v)} />
          <ChipMultiSelect label="verbs" values={rule.verbs} options={verbOptions} onChange={(v) => updateRule(index, 'verbs', v)} />
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
