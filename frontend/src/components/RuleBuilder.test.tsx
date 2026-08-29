// frontend/src/components/RuleBuilder.test.tsx
import { render, screen, fireEvent, within } from '@testing-library/react';
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

  it("filters the resources dropdown to the rule's selected apiGroups", () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(
      <RuleBuilder rules={[{ apiGroups: ['apps'], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />,
    );
    const select = screen.getByLabelText('add-resources');
    expect(within(select).getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'pods' })).not.toBeInTheDocument();
  });

  it('lists all resources when no apiGroup is selected yet', () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    const select = screen.getByLabelText('add-resources');
    expect(within(select).getByRole('option', { name: 'pods' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'deployments' })).toBeInTheDocument();
  });

  it('suffixes custom-resource options with "(Custom Resource)"', () => {
    const catalog = [
      { group: 'tekton.dev', version: 'v1', resource: 'pipelines', kind: 'Pipeline', namespaced: true, isCustomResource: true },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    expect(
      within(screen.getByLabelText('add-resources')).getByRole('option', { name: 'pipelines (Custom Resource)' }),
    ).toBeInTheDocument();
  });

  it('adds a bare resource with no subResource selected', () => {
    const onChange = vi.fn();
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false, subResources: ['log'] },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} resourceCatalog={catalog} />);
    fireEvent.change(screen.getByLabelText('add-resources'), { target: { value: 'pods' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['pods'], verbs: [] }]);
  });

  it('combines resource and subResource into a single chip', () => {
    const onChange = vi.fn();
    const catalog = [
      {
        group: '',
        version: 'v1',
        resource: 'pods',
        kind: 'Pod',
        namespaced: true,
        isCustomResource: false,
        subResources: ['log', 'status'],
      },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} resourceCatalog={catalog} />);
    fireEvent.change(screen.getByLabelText('add-resources'), { target: { value: 'pods' } });
    fireEvent.change(screen.getByLabelText('add-subresource'), { target: { value: 'log' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['pods/log'], verbs: [] }]);
  });

  it('adds a custom resource string typed into the free-text field', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} />);
    const input = screen.getByLabelText('custom-resources');
    fireEvent.change(input, { target: { value: 'widgets.example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: ['widgets.example.com'], verbs: [] }]);
  });

  it('shows help tooltips for apiGroups, resources, subResource, and verbs', () => {
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} />);
    expect(screen.getByLabelText('apiGroups help')).toBeInTheDocument();
    expect(screen.getByLabelText('resources help')).toBeInTheDocument();
    expect(screen.getByLabelText('subResource help')).toBeInTheDocument();
    expect(screen.getByLabelText('verbs help')).toBeInTheDocument();
  });
});
