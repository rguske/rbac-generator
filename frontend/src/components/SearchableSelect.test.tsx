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

  it("falls back to displaying the raw value when it isn't in the options list", () => {
    render(<SearchableSelect ariaLabel="namespace" placeholder="Select a namespace" value="custom-ns" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByLabelText('namespace')).toHaveValue('custom-ns');
  });

  describe('allowCustomValue', () => {
    it('does not offer a custom option by default (allowCustomValue unset)', () => {
      render(<SearchableSelect ariaLabel="namespace" placeholder="Select a namespace" value="" options={OPTIONS} onChange={() => {}} />);
      const input = screen.getByLabelText('namespace');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'brand-new-ns' } });
      expect(screen.queryByText('Use "brand-new-ns"')).not.toBeInTheDocument();
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('offers a "Use <text>" option for text that matches nothing when allowCustomValue is set', () => {
      render(
        <SearchableSelect ariaLabel="namespace" placeholder="Select a namespace" value="" options={OPTIONS} onChange={() => {}} allowCustomValue />,
      );
      const input = screen.getByLabelText('namespace');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'brand-new-ns' } });
      expect(screen.getByText('Use "brand-new-ns"')).toBeInTheDocument();
    });

    it('commits the custom value on Enter when nothing matches', () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect ariaLabel="namespace" placeholder="Select a namespace" value="" options={OPTIONS} onChange={onChange} allowCustomValue />,
      );
      const input = screen.getByLabelText('namespace');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'brand-new-ns' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('brand-new-ns');
    });

    it('commits the custom value when its "Use <text>" option is clicked', () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect ariaLabel="namespace" placeholder="Select a namespace" value="" options={OPTIONS} onChange={onChange} allowCustomValue />,
      );
      const input = screen.getByLabelText('namespace');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'brand-new-ns' } });
      fireEvent.click(screen.getByText('Use "brand-new-ns"'));
      expect(onChange).toHaveBeenCalledWith('brand-new-ns');
    });

    it('prefers selecting an existing partial match over the custom option on Enter', () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={onChange} allowCustomValue />,
      );
      const input = screen.getByLabelText('add-resources');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'depl' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith('deployments');
    });

    it('does not offer a custom option when the typed text exactly matches an existing option', () => {
      render(
        <SearchableSelect ariaLabel="add-resources" placeholder="Add resource..." value="" options={OPTIONS} onChange={() => {}} allowCustomValue />,
      );
      const input = screen.getByLabelText('add-resources');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'pods' } });
      expect(screen.queryByText('Use "pods"')).not.toBeInTheDocument();
    });
  });
});
