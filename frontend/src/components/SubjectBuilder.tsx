// frontend/src/components/SubjectBuilder.tsx
import { useRef } from 'react';
import { Button, FormSelect, FormSelectOption, TextInput } from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import type { Subject } from '../types/rbac';

interface SubjectBuilderProps {
  subjects: Subject[];
  onChange: (subjects: Subject[]) => void;
  serviceAccounts: string[];
}

const KIND_OPTIONS: Subject['kind'][] = ['ServiceAccount', 'User', 'Group'];

export function SubjectBuilder({ subjects, onChange, serviceAccounts }: SubjectBuilderProps) {
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

  const updateSubject = (index: number, field: keyof Subject, value: string) => {
    onChange(subjects.map((subject, i) => (i === index ? { ...subject, [field]: value } : subject)));
  };

  const addSubject = () => {
    onChange([...subjects, { kind: 'ServiceAccount', name: '' }]);
  };

  const removeSubject = (index: number) => {
    onChange(subjects.filter((_, i) => i !== index));
  };

  return (
    <div data-testid="subject-builder">
      {subjects.map((subject, index) => (
        <div key={getObjectKey(subject)} data-testid={`subject-row-${index}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <FormSelect aria-label={`subject-kind-${index}`} value={subject.kind} onChange={(_e, value) => updateSubject(index, 'kind', value)}>
            {KIND_OPTIONS.map((kind) => (
              <FormSelectOption key={kind} value={kind} label={kind} />
            ))}
          </FormSelect>
          {subject.kind === 'ServiceAccount' ? (
            <FormSelect aria-label={`subject-name-${index}`} value={subject.name} onChange={(_e, value) => updateSubject(index, 'name', value)}>
              <FormSelectOption key="" value="" label="Select a ServiceAccount" />
              {serviceAccounts.map((sa) => (
                <FormSelectOption key={sa} value={sa} label={sa} />
              ))}
            </FormSelect>
          ) : (
            <TextInput
              aria-label={`subject-name-${index}`}
              value={subject.name}
              onChange={(_e, value) => updateSubject(index, 'name', value)}
              placeholder="Name"
            />
          )}
          <Button variant="plain" aria-label={`remove-subject-${index}`} onClick={() => removeSubject(index)}>
            <MinusCircleIcon />
          </Button>
        </div>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addSubject}>
        Add subject
      </Button>
    </div>
  );
}
