// frontend/src/components/YamlToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { YamlToggle } from './YamlToggle';

vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditor: ({ code, onChange }: { code: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-code-editor" value={code} onChange={(e) => onChange(e.target.value)} />
  ),
  Language: { yaml: 'yaml' },
}));

describe('YamlToggle', () => {
  it('renders the form by default', () => {
    render(<YamlToggle value={{ name: 'reader' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
  });

  it('switches to the YAML editor when YAML is clicked', () => {
    render(<YamlToggle value={{ name: 'reader' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('form-view')).not.toBeInTheDocument();
  });

  it('parses valid YAML back into the form value on toggle to Form', () => {
    const onChange = vi.fn();
    render(<YamlToggle value={{ name: 'reader' }} onChange={onChange} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: updated\n' } });
    fireEvent.click(screen.getByText('Form'));
    expect(onChange).toHaveBeenCalledWith({ name: 'updated' });
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
  });

  it('shows an error and stays in YAML mode when the YAML is invalid', () => {
    const onChange = vi.fn();
    render(<YamlToggle value={{ name: 'reader' }} onChange={onChange} kind="Role" renderForm={() => <div data-testid="form-view" />} />);
    fireEvent.click(screen.getByText('YAML'));
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'kind: ClusterRole\nname: updated\n' } });
    fireEvent.click(screen.getByText('Form'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Expected kind "Role", got "ClusterRole"');
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
  });
});
