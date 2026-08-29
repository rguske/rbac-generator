// frontend/src/components/YamlToggle.tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { toYaml, fromYaml } from '../lib/yamlSync';

interface YamlToggleProps<T> {
  value: T;
  onChange: (value: T) => void;
  kind: string;
  renderForm: () => ReactNode;
}

export function YamlToggle<T>({ value, onChange, kind, renderForm }: YamlToggleProps<T>) {
  const [mode, setMode] = useState<'form' | 'yaml'>('form');
  const [yamlText, setYamlText] = useState(() => toYaml(value));
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (target: 'form' | 'yaml') => {
    if (target === mode) return;
    if (target === 'yaml') {
      setYamlText(toYaml(value));
      setError(null);
      setMode('yaml');
      return;
    }
    try {
      const parsed = fromYaml<T>(yamlText, kind);
      onChange(parsed);
      setError(null);
      setMode('form');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid YAML');
    }
  };

  return (
    <div data-testid="yaml-toggle">
      <ToggleGroup aria-label="Form or YAML view">
        <ToggleGroupItem text="Form" isSelected={mode === 'form'} onChange={() => handleToggle('form')} />
        <ToggleGroupItem text="YAML" isSelected={mode === 'yaml'} onChange={() => handleToggle('yaml')} />
      </ToggleGroup>
      {error && <div role="alert">{error}</div>}
      {mode === 'form' ? (
        renderForm()
      ) : (
        <CodeEditor code={yamlText} language={Language.yaml} onChange={(code) => setYamlText(code)} height="400px" />
      )}
    </div>
  );
}
