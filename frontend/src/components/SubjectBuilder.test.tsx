// frontend/src/components/SubjectBuilder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubjectBuilder } from './SubjectBuilder';

const noDiscovery = { serviceAccounts: [], users: [], groups: [] };

describe('SubjectBuilder', () => {
  it('renders one row per subject', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} {...noDiscovery} />);
    expect(screen.getByTestId('subject-row-0')).toBeInTheDocument();
  });

  it('adds a new ServiceAccount subject when Add subject is clicked', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[]} onChange={onChange} {...noDiscovery} />);
    fireEvent.click(screen.getByText('Add subject'));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'ServiceAccount', name: '' }]);
  });

  it('removes a subject when its remove button is clicked', () => {
    const onChange = vi.fn();
    const subjects = [{ kind: 'User' as const, name: 'alice' }, { kind: 'Group' as const, name: 'admins' }];
    render(<SubjectBuilder subjects={subjects} onChange={onChange} {...noDiscovery} />);
    fireEvent.click(screen.getByLabelText('remove-subject-0'));
    expect(onChange).toHaveBeenCalledWith([subjects[1]]);
  });

  it('shows a searchable ServiceAccount dropdown populated from the serviceAccounts prop', () => {
    render(
      <SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={() => {}} {...noDiscovery} serviceAccounts={['builder']} />,
    );
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    expect(screen.getByRole('option', { name: 'builder' })).toBeInTheDocument();
  });

  it('filters the ServiceAccount dropdown as the user types a search term', () => {
    render(
      <SubjectBuilder
        subjects={[{ kind: 'ServiceAccount', name: '' }]}
        onChange={() => {}}
        {...noDiscovery}
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
      <SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={onChange} {...noDiscovery} serviceAccounts={['builder']} />,
    );
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    fireEvent.click(screen.getByRole('option', { name: 'builder' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'ServiceAccount', name: 'builder' }]);
  });

  it('does not allow a custom ServiceAccount value that is not in the list', () => {
    render(
      <SubjectBuilder subjects={[{ kind: 'ServiceAccount', name: '' }]} onChange={() => {}} {...noDiscovery} serviceAccounts={['builder']} />,
    );
    const input = screen.getByLabelText('subject-name-0');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.queryByRole('option', { name: 'Use "nonexistent"' })).not.toBeInTheDocument();
  });

  it('shows a searchable, custom-value-capable field for User subjects', () => {
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={() => {}} {...noDiscovery} />);
    expect(screen.getByLabelText('subject-name-0')).toHaveValue('alice');
  });

  it('offers discovered Users in the dropdown', () => {
    render(
      <SubjectBuilder subjects={[{ kind: 'User', name: '' }]} onChange={() => {}} {...noDiscovery} users={['alice', 'bob']} />,
    );
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    expect(screen.getByRole('option', { name: 'alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'bob' })).toBeInTheDocument();
  });

  it('selects a discovered User from the dropdown', () => {
    const onChange = vi.fn();
    render(
      <SubjectBuilder subjects={[{ kind: 'User', name: '' }]} onChange={onChange} {...noDiscovery} users={['alice']} />,
    );
    fireEvent.click(screen.getByLabelText('subject-name-0'));
    fireEvent.click(screen.getByRole('option', { name: 'alice' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'User', name: 'alice' }]);
  });

  it('still allows typing a custom User name not in the discovered list', () => {
    const onChange = vi.fn();
    render(
      <SubjectBuilder subjects={[{ kind: 'User', name: '' }]} onChange={onChange} {...noDiscovery} users={['alice']} />,
    );
    const input = screen.getByLabelText('subject-name-0');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'charlie' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "charlie"' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'User', name: 'charlie' }]);
  });

  it('offers discovered Groups in the dropdown and still allows a custom value', () => {
    const onChange = vi.fn();
    render(
      <SubjectBuilder subjects={[{ kind: 'Group', name: '' }]} onChange={onChange} {...noDiscovery} groups={['cluster-admins']} />,
    );
    const input = screen.getByLabelText('subject-name-0');
    fireEvent.click(input);
    expect(screen.getByRole('option', { name: 'cluster-admins' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'new-group' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "new-group"' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'Group', name: 'new-group' }]);
  });

  it('updates the subject kind when changed', () => {
    const onChange = vi.fn();
    render(<SubjectBuilder subjects={[{ kind: 'User', name: 'alice' }]} onChange={onChange} {...noDiscovery} />);
    fireEvent.change(screen.getByLabelText('subject-kind-0'), { target: { value: 'Group' } });
    expect(onChange).toHaveBeenCalledWith([{ kind: 'Group', name: 'alice' }]);
  });
});
