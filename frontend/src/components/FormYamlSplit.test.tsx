// frontend/src/components/FormYamlSplit.test.tsx
import { useState } from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FormYamlSplit } from './FormYamlSplit';

vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditor: ({
    code,
    onChange,
    isDarkTheme,
  }: {
    code: string;
    onChange: (v: string) => void;
    isDarkTheme?: boolean;
  }) => (
    <textarea
      data-testid="mock-code-editor"
      data-dark-theme={String(Boolean(isDarkTheme))}
      value={code}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  Language: { yaml: 'yaml' },
}));

function Harness({ initial }: { initial: { name: string } }) {
  const [value, setValue] = useState(initial);
  return (
    <FormYamlSplit value={value} onChange={setValue} kind="Role" renderForm={() => <div data-testid="form-view">{value.name}</div>} />
  );
}

describe('FormYamlSplit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  it('renders the form and the YAML editor at the same time', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getByTestId('form-view')).toBeInTheDocument();
    expect(screen.getByTestId('mock-code-editor')).toBeInTheDocument();
  });

  it('sizes the YAML pane to fill the available viewport height instead of a fixed pixel height', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    const pane = screen.getByTestId('yaml-pane');
    expect(pane.style.height).toContain('100vh');
    expect(pane.style.minHeight).toBe('400px');
  });

  it('reflects the initial value in the YAML pane', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('name: reader\n');
  });

  it('switches the YAML editor theme to match the app-wide dark mode toggle', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getByTestId('mock-code-editor')).toHaveAttribute('data-dark-theme', 'false');

    document.documentElement.classList.add('pf-v6-theme-dark');
    render(<Harness initial={{ name: 'reader' }} />);
    expect(screen.getAllByTestId('mock-code-editor')[1]).toHaveAttribute('data-dark-theme', 'true');
  });

  it('updates the YAML pane when the form value changes externally', () => {
    const { rerender } = render(
      <FormYamlSplit value={{ name: 'a' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />,
    );
    rerender(
      <FormYamlSplit value={{ name: 'b' }} onChange={() => {}} kind="Role" renderForm={() => <div data-testid="form-view" />} />,
    );
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('name: b\n');
  });

  it('parses valid YAML back into the form after the debounce', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: updated\n' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('form-view')).toHaveTextContent('updated');
  });

  it('shows an inline error for invalid YAML without blocking typing or reverting the text', () => {
    render(<Harness initial={{ name: 'reader' }} />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'kind: ClusterRole\nname: updated\n' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Expected kind "Role", got "ClusterRole"');
    expect(screen.getByTestId('mock-code-editor')).toHaveValue('kind: ClusterRole\nname: updated\n');
    expect(screen.getByTestId('form-view')).toHaveTextContent('reader');
  });

  it("does not clobber the YAML pane's own text with a reformatted round-trip after a YAML-originated change", () => {
    render(<Harness initial={{ name: 'reader' }} />);
    // Deliberately unusual quoting that toYaml would not reproduce
    // byte-for-byte, to prove the pane keeps the user's raw text instead of
    // re-serializing the just-parsed value back into it.
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: "name: 'updated'\n" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('mock-code-editor')).toHaveValue("name: 'updated'\n");
  });

  it('cancels a pending YAML-side parse if the form changes first', () => {
    const onChange = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState<{ name: string }>({ name: 'reader' });
      return (
        <>
          <button onClick={() => setValue({ name: 'from-form' })}>set-from-form</button>
          <FormYamlSplit
            value={value}
            onChange={(v) => {
              onChange(v);
              setValue(v);
            }}
            kind="Role"
            renderForm={() => <div data-testid="form-view">{value.name}</div>}
          />
        </>
      );
    }
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('mock-code-editor'), { target: { value: 'name: from-yaml\n' } });
    fireEvent.click(screen.getByText('set-from-form'));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onChange).not.toHaveBeenCalledWith({ name: 'from-yaml' });
    expect(screen.getByTestId('form-view')).toHaveTextContent('from-form');
  });
});
