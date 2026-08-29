// frontend/src/components/FieldHelp.tsx
// TEMPORARY placeholder — Task 5 replaces this with a real Popover-based
// help tooltip. This stub exists only so Task 2/3/4 compile in isolation.
import type { ReactNode } from 'react';

interface FieldHelpProps {
  label: string;
  children: ReactNode;
}

export function FieldHelp({ label }: FieldHelpProps) {
  return <span aria-label={`${label} help`} />;
}
