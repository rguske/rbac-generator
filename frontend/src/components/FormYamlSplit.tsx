// frontend/src/components/FormYamlSplit.tsx
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { Flex, FlexItem } from '@patternfly/react-core';
import { toYaml, fromYaml } from '../lib/yamlSync';
import { useIsDarkTheme } from '../hooks/useIsDarkTheme';

interface FormYamlSplitProps<T> {
  value: T;
  onChange: (value: T) => void;
  kind: string;
  renderForm: () => ReactNode;
}

const YAML_SYNC_DEBOUNCE_MS = 400;

export function FormYamlSplit<T>({ value, onChange, kind, renderForm }: FormYamlSplitProps<T>) {
  const [yamlText, setYamlText] = useState(() => toYaml(value));
  const [error, setError] = useState<string | null>(null);
  const lastChangeSource = useRef<'form' | 'yaml'>('form');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDarkTheme = useIsDarkTheme();

  useEffect(() => {
    if (lastChangeSource.current === 'yaml') {
      // `value` just changed because we ourselves parsed the YAML pane's
      // text and called onChange; the pane's text is already what produced
      // it, so don't re-serialize it back and clobber the user's raw text
      // (and cursor position) with a reformatted round-trip.
      lastChangeSource.current = 'form';
      return;
    }
    // A genuine form-side change supersedes any YAML edit still pending in
    // the debounce, so a stale parse doesn't overwrite it a moment later.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setYamlText(toYaml(value));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleYamlChange = (text: string) => {
    setYamlText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const parsed = fromYaml<T>(text, kind);
        setError(null);
        lastChangeSource.current = 'yaml';
        onChange(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid YAML');
      }
    }, YAML_SYNC_DEBOUNCE_MS);
  };

  return (
    <div data-testid="form-yaml-split">
      <Flex direction={{ default: 'column', lg: 'row' }} gap={{ default: 'gapMd' }}>
        <FlexItem flex={{ default: 'flex_1' }}>{renderForm()}</FlexItem>
        <FlexItem flex={{ default: 'flex_1' }}>
          {error && <div role="alert">{error}</div>}
          {/* Fill as much of the viewport as is available below the masthead
              and above the action buttons, instead of a fixed pixel height,
              so the YAML pane is as large as the screen allows. isFullHeight
              makes the editor itself stretch to fill this wrapper. */}
          <div data-testid="yaml-pane" style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
            <CodeEditor
              code={yamlText}
              language={Language.yaml}
              onChange={handleYamlChange}
              isFullHeight
              isDarkTheme={isDarkTheme}
            />
          </div>
        </FlexItem>
      </Flex>
    </div>
  );
}
