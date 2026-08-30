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
    fireEvent.click(screen.getByLabelText('add-verbs'));
    fireEvent.click(screen.getByRole('option', { name: 'get' }));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['get'] }]);
  });

  it('filters the verbs dropdown as the user types a search term', () => {
    render(
      <RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} verbOptions={['get', 'list', 'watch']} />,
    );
    const input = screen.getByLabelText('add-verbs');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'wat' } });
    expect(screen.getByRole('option', { name: 'watch' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'get' })).not.toBeInTheDocument();
  });

  it('removes a value when its remove button is clicked', () => {
    const onChange = vi.fn();
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: ['get', 'list'] }]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('remove-verbs-get'));
    expect(onChange).toHaveBeenCalledWith([{ apiGroups: [], resources: [], verbs: ['list'] }]);
  });

  it('highlights selected verbs, apiGroups, and resources chips in blue', () => {
    render(
      <RuleBuilder
        rules={[{ apiGroups: ['apps'], resources: ['deployments'], verbs: ['get'] }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('apps').closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
    expect(screen.getByText('deployments').closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
    expect(screen.getByText('get').closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
  });

  it("filters the resources dropdown to the rule's selected apiGroups", () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(
      <RuleBuilder rules={[{ apiGroups: ['apps'], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />,
    );
    fireEvent.click(screen.getByLabelText('add-resources'));
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'pods' })).not.toBeInTheDocument();
  });

  it('lists all resources when no apiGroup is selected yet', () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    expect(screen.getByRole('option', { name: 'pods' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
  });

  it('filters the resources dropdown as the user types a search term', () => {
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false },
      { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    const input = screen.getByLabelText('add-resources');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'dep' } });
    expect(screen.getByRole('option', { name: 'deployments' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'pods' })).not.toBeInTheDocument();
  });

  it('suffixes custom-resource options with "(Custom Resource)"', () => {
    const catalog = [
      { group: 'tekton.dev', version: 'v1', resource: 'pipelines', kind: 'Pipeline', namespaced: true, isCustomResource: true },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} resourceCatalog={catalog} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    expect(screen.getByRole('option', { name: 'pipelines (Custom Resource)' })).toBeInTheDocument();
  });

  it('adds a bare resource with no subResource selected', () => {
    const onChange = vi.fn();
    const catalog = [
      { group: '', version: 'v1', resource: 'pods', kind: 'Pod', namespaced: true, isCustomResource: false, subResources: ['log'] },
    ];
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={onChange} resourceCatalog={catalog} />);
    fireEvent.click(screen.getByLabelText('add-resources'));
    fireEvent.click(screen.getByRole('option', { name: 'pods' }));
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
    fireEvent.click(screen.getByLabelText('add-resources'));
    fireEvent.click(screen.getByRole('option', { name: 'pods' }));
    fireEvent.click(screen.getByLabelText('add-subresource'));
    fireEvent.click(screen.getByRole('option', { name: 'log' }));
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

  it('does not render a nonResourceURLs field for ordinary rules', () => {
    render(<RuleBuilder rules={[{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }]} onChange={() => {}} />);
    expect(screen.queryByTestId('multiselect-nonResourceURLs')).not.toBeInTheDocument();
  });

  it('shows and preserves nonResourceURLs for a rule seeded with them, e.g. from a template', () => {
    render(
      <RuleBuilder
        rules={[{ apiGroups: [], resources: [], verbs: ['get'], nonResourceURLs: ['/healthz', '/version'] }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('multiselect-nonResourceURLs')).toBeInTheDocument();
    expect(screen.getByText('/healthz')).toBeInTheDocument();
    expect(screen.getByText('/version')).toBeInTheDocument();
  });

  it('keeps nonResourceURLs intact when editing another field on the same rule', () => {
    const onChange = vi.fn();
    render(
      <RuleBuilder
        rules={[{ apiGroups: [], resources: [], verbs: ['get'], nonResourceURLs: ['/healthz'] }]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('custom-verbs');
    fireEvent.change(input, { target: { value: 'head' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([
      { apiGroups: [], resources: [], verbs: ['get', 'head'], nonResourceURLs: ['/healthz'] },
    ]);
  });

  it('adds a custom nonResourceURLs entry typed into the free-text field', () => {
    const onChange = vi.fn();
    render(
      <RuleBuilder
        rules={[{ apiGroups: [], resources: [], verbs: ['get'], nonResourceURLs: ['/healthz'] }]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('custom-nonResourceURLs');
    fireEvent.change(input, { target: { value: '/version' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([
      { apiGroups: [], resources: [], verbs: ['get'], nonResourceURLs: ['/healthz', '/version'] },
    ]);
  });

  it('shows help tooltips for apiGroups, resources, subResource, and verbs', () => {
    render(<RuleBuilder rules={[{ apiGroups: [], resources: [], verbs: [] }]} onChange={() => {}} />);
    expect(screen.getByLabelText('apiGroups help')).toBeInTheDocument();
    expect(screen.getByLabelText('resources help')).toBeInTheDocument();
    expect(screen.getByLabelText('subResource help')).toBeInTheDocument();
    expect(screen.getByLabelText('verbs help')).toBeInTheDocument();
  });
});
