// frontend/src/components/FieldHelp.tsx
import type { ReactNode } from 'react';
import { FormGroupLabelHelp, Popover } from '@patternfly/react-core';

interface FieldHelpProps {
  label: string;
  children: ReactNode;
}

export function FieldHelp({ label, children }: FieldHelpProps) {
  return (
    <Popover bodyContent={children}>
      <FormGroupLabelHelp aria-label={`${label} help`} />
    </Popover>
  );
}
