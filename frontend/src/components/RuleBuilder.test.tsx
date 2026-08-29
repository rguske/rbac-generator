// frontend/src/components/RuleBuilder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RuleBuilder } from './RuleBuilder';

describe('RuleBuilder', () => {
  it('renders one row per rule', () => {
    render(<RuleBuilder rules={[{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }]} onChange={() => {}} />);
    expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
  });

  it('adds a new empty rule when Add rule is clicked', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add rule'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: [] }]);
  });

  it('removes a rule when its remove button is clicked', () => {
    const onChange = vi.fn();
    const rules = [
      { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
      { apiGroups: [''], resources: ['services'], verbs: ['list'] },
    ];
    render(<RuleBuilder rules={rules} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('remove-rule-0'));
    expect(onChange).toHaveBeenCalledWith([rules[1]]);
  });

  it('adds a custom verb typed into the free-text field on Enter', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} />);
    const input = screen.getByLabelText('custom-verbs');
    fireEvent.change(input, { target: { value: 'watch' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['watch'] }]);
  });

  it('adds a verb selected from the discovery options dropdown', () => {
    const onChange = vi.fn();
    render(
      <RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} verbOptions={['get', 'list']} />,
    );
    fireEvent.change(screen.getByLabelText('add-verbs'), { target: { value: 'get' } });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['get'] }]);
  });

  it('removes a value when its remove button is clicked', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: ['get', 'list'] }]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('remove-verbs-get'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['list'] }]);
  });
});
