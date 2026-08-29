// frontend/src/components/FieldHelp.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldHelp } from './FieldHelp';

describe('FieldHelp', () => {
  it('renders a help trigger with an accessible name derived from the label', () => {
    render(<FieldHelp label="Namespace">Some help text</FieldHelp>);
    expect(screen.getByLabelText('Namespace help')).toBeInTheDocument();
  });

  it('shows the help text in a popover when clicked', async () => {
    render(<FieldHelp label="Namespace">The namespace this Role applies to.</FieldHelp>);
    fireEvent.click(screen.getByLabelText('Namespace help'));
    await waitFor(() => expect(screen.getByText('The namespace this Role applies to.')).toBeInTheDocument());
  });
});
