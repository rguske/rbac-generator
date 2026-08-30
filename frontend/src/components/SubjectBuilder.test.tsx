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

  it('shows a searchable ServiceAccount dropdown populated from the serviceAccounts prop', () => {
    render(<SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={() => {}} serviceAccounts={['builder']} />);
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    expect(screen.getByRole('option', { name: 'builder' })).toBeInTheDocument();
  });

  it('filters the ServiceAccount dropdown as the user types a search term', () => {
    render(
      <SubjectBuilder
        subjects={[{ kind: 'ServiceAccount', name: '' }]}
        onChange={() => {}}
        serviceAccounts={['builder', 'default', 'deployer']}
      />,
    );
    const input = screen.getByLabelText('subject-name-0');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'dep' } });
    expect(screen.getByRole('option', { name: 'deployer' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'builder' })).not.toBeInTheDocument();
  });

  it('selects a ServiceAccount from the dropdown', () => {
    const onChange = vi.fn();
    render(
      <SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={onChange} serviceAccounts={['builder']} />,
    );
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    fireEvent.click(screen.getByRole('option', { name: 'builder' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'ServiceAccount', name: 'builder' }]);
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

});
