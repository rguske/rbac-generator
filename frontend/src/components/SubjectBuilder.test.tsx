// frontend/src/components/SubjectBuilder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubjectBuilder } from './SubjectBuilder';

describe('SubjectBuilder', () => {
  it('renders one row per subject', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByTestId('subject-row-0')).toBeInTheDocument();
  });

  it('adds a new ServiceAccount subject when Add subject is clicked', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[]} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.click(screen.getByText('Add subject'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'ServiceAccount', name: '' }]);
  });

  it('removes a subject when its remove button is clicked', () => {
    const onChange = vi.fn();
    const subjects = [{ kind: 'User' as const, name: 'alice' }, { kind: 'Group' as const, name: 'admins' }];
    render(<SubjectBuilder subjects={subjects} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.click(screen.getByLabelText('remove-subject-0'));
    expect(onChange).toHaveBeenCalledWith([subjects[1]]);
  });

  it('shows a ServiceAccount dropdown populated from the serviceAccounts prop', () => {
    render(<SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={() => {}} serviceAccounts={['builder']} />);
    expect(screen.getByRole('option', { name: 'builder' })).toBeInTheDocument();
  });

  it('shows a free-text field for User subjects', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByLabelText('subject-name-0')).toHaveValue('alice');
  });

  it('updates the subject kind when changed', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={onChange} serviceAccounts={[]} />);
    fireEvent.change(screen.getByLabelText('subject-kind-0'), { target: { value: 'Group' } });
    expect(onChange).toHaveBeenCalledWith([{ kind: 'Group', name: 'alice' }]);
  });

  it('shows a help tooltip explaining Kind/Name/Namespace', () => {
    render(<SubjectBuilder subjects={[]} onChange={() => {}} serviceAccounts={[]} />);
    expect(screen.getByLabelText('Subjects help')).toBeInTheDocument();
  });
});
