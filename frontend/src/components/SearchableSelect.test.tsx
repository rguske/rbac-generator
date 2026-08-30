// frontend/src/components/SearchableSelect.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from './SearchableSelect';

const OPTIONS = [
  { value: 'pods', label: 'pods' },
  { value: 'pods/log', label: 'pods/log' },
  { value: 'deployments', label: 'deployments' },
  { value: 'services', label: 'services' },
];

describe('SearchableSelect', () => {
  it('renders a text input with the given aria-label and placeholder', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText('add-resources');
    expect(input).toHaveAttribute('placeholder', 'Add resource...');
  });

  it('does not show any options until the input is opened', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('shows all options when clicked open with no filter text', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    expect(screen.getByRole('option', { name: 'pods' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'services' })).toBeInTheDocument();
  });

  it('filters the option list as the user types (search)', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'dep' } });
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'pods' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'services' })).not.toBeInTheDocument();
  });

  it('filtering is case-insensitive', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'DEP' } });
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
  });

  it('shows a "No results found" option when nothing matches', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('calls onChange with the selected option value when an option is clicked', () => {
    const onChange = vi.fn();
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    fireEvent.click(screen.getByRole('option', { name: 'deployments' }));
    expect(onChange).toHaveBeenCalledWith('deployments');
  });

  it('closes the option list after a selection is made', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    fireEvent.click(screen.getByRole('option', { name: 'deployments' }));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it("shows the currently selected option's label in the closed input", () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="deployments" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByLabelText('add-resources')).toHaveValue('deployments');
  });

  it('selects the top filtered option when Enter is pressed', () => {
    const onChange = vi.fn();
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={onChange} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'dep' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('deployments');
  });

  it('distinguishes a resource from its subresource when both share a filter prefix', () => {
    render(<SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'pods' } });
    expect(screen.getByRole('option', { name: 'pods' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'pods/log' })).toBeInTheDocument();
  });
});
