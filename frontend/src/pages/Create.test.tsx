import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { CreatePage } from './Create';
import * as api from '../api/client';

vi.mock('../api/client');

vi.mock('../components/FormYamlSplit', () => ({
  FormYamlSplit: ({ renderForm }: { renderForm: () => ReactNode }) => renderForm(),
}));

describe('CreatePage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: ['get', 'list'] });
    vi.spyOn(api, 'getNamespaces').mockResolvedValue([]);
  });

  /** Types text into the Namespace field and commits it, like a user would. */
  const setNamespace = (value: string) => {
    const namespaceInput = screen.getByLabelText('Namespace');
    fireEvent.click(namespaceInput);
    fireEvent.change(namespaceInput, { target: { value } });
    fireEvent.keyDown(namespaceInput, { key: 'Enter' });
  };

  it('disables Dry-Run and Apply when not connected', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByText('Preview & Dry-Run').closest('button')).toBeDisabled();
    expect(screen.getByText('Apply').closest('button')).toBeDisabled();
  });

  it('enables Apply only after a successful dry-run', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    render(<CreatePage connected />);

    const nameInput = screen.getByRole('textbox', { name: 'Name' });

    fireEvent.change(nameInput, { target: { value: 'reader' } });
    setNamespace('default');
    fireEvent.click(screen.getByText('Preview & Dry-Run'));

    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());
    expect(api.dryRun).toHaveBeenCalledWith('roles', expect.objectContaining({ name: 'reader', namespace: 'default' }));
  });

  it('calls createResource with the built resource on Apply', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    vi.spyOn(api, 'createResource').mockResolvedValue({});
    render(<CreatePage connected />);

    const nameInput = screen.getByRole('textbox', { name: 'Name' });

    fireEvent.change(nameInput, { target: { value: 'reader' } });
    setNamespace('default');
    fireEvent.click(screen.getByText('Preview & Dry-Run'));
    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());

    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() =>
      expect(api.createResource).toHaveBeenCalledWith('roles', expect.objectContaining({ name: 'reader', namespace: 'default' })),
    );
  });

  it('shows the SubjectBuilder and hides RuleBuilder when switching to ClusterRoleBinding', () => {
    render(<CreatePage connected />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'clusterrolebindings' } });
    expect(screen.queryByTestId('rule-builder')).not.toBeInTheDocument();
    expect(screen.getByTestId('subject-builder')).toBeInTheDocument();
  });

  it('dedupes discovery resources by group+resource before building the catalog', async () => {
    const mockGetDiscovery = vi.mocked(api.getDiscoveryResources);
    mockGetDiscovery.mockReset();
    mockGetDiscovery.mockResolvedValue({
      source: 'live',
      resources: [
        { group: 'apps', version: 'v1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
        { group: 'apps', version: 'v1beta1', resource: 'deployments', kind: 'Deployment', namespaced: true, isCustomResource: false },
      ],
      verbs: ['get'],
    });
    render(<CreatePage connected />);
    // First add a rule so the resources dropdown appears
    fireEvent.click(screen.getByText('Add rule'));
    await waitFor(() => expect(mockGetDiscovery).toHaveBeenCalled());
    // Now the catalog should be loaded, wait a bit more for state to update
    await waitFor(() => screen.getByLabelText('add-resources'), { timeout: 3000 });
    fireEvent.click(screen.getByLabelText('add-resources'));
    const options = screen.getAllByRole('option', { name: 'deployments' });
    expect(options).toHaveLength(1);
  });

  it('shows help tooltips next to the Name and Namespace fields', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByLabelText('Name help')).toBeInTheDocument();
    expect(screen.getByLabelText('Namespace help')).toBeInTheDocument();
  });

  it('shows a help tooltip for Role reference name on binding kinds', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'rolebindings' } });
    expect(screen.getByLabelText('Role reference name help')).toBeInTheDocument();
  });

  it('shows a help tooltip next to the Subjects section on binding kinds', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'rolebindings' } });
    expect(screen.getByLabelText('Subjects help')).toBeInTheDocument();
  });

  it('clears entered field values when Reset is clicked', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'reader' } });
    setNamespace('default');

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(screen.getByLabelText('Namespace')).toHaveValue('');
  });

  it('resets Kind back to Role when Reset is clicked', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'clusterrolebindings' } });
    expect(screen.getByTestId('subject-builder')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByLabelText('Kind')).toHaveValue('roles');
    expect(screen.getByTestId('rule-builder')).toBeInTheDocument();
  });

  it('groups fields into a "General" section', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('groups the rule builder into a "Rules" section', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.queryByText('Role reference')).not.toBeInTheDocument();
    expect(screen.queryByText('Subjects')).not.toBeInTheDocument();
  });

  it('groups the role reference and subjects fields into their own sections for binding kinds', () => {
    render(<CreatePage connected={false} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'rolebindings' } });
    expect(screen.getByText('Role reference')).toBeInTheDocument();
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.queryByText('Rules')).not.toBeInTheDocument();
  });

  it('disables Apply again after Reset even if a dry-run had already passed', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    render(<CreatePage connected />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'reader' } });
    setNamespace('default');
    fireEvent.click(screen.getByText('Preview & Dry-Run'));
    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());

    fireEvent.click(screen.getByText('Reset'));

    expect(screen.getByText('Apply').closest('button')).toBeDisabled();
  });

  it('seeds the form from initialKind/initialResource when provided (e.g. from a Template)', () => {
    render(
      <CreatePage
        connected={false}
        initialKind="clusterroles"
        initialResource={{ name: 'vm-admin', rules: [{ apiGroups: ['kubevirt.io'], resources: ['virtualmachines'], verbs: ['*'] }] }}
      />,
    );

    expect(screen.getByLabelText('Kind')).toHaveValue('clusterroles');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('vm-admin');
    expect(screen.getByTestId('multiselect-resources')).toHaveTextContent('virtualmachines');
  });

  it('seeds the namespace field when initialResource includes one (e.g. a Role template)', () => {
    render(<CreatePage connected={false} initialKind="roles" initialResource={{ name: 'vm-admin', namespace: 'vms', rules: [] }} />);

    expect(screen.getByLabelText('Namespace')).toHaveValue('vms');
  });

  describe('namespace discovery', () => {
    it('does not fetch namespaces while disconnected', () => {
      const getNamespacesSpy = vi.mocked(api.getNamespaces);
      getNamespacesSpy.mockClear();
      render(<CreatePage connected={false} />);
      expect(getNamespacesSpy).not.toHaveBeenCalled();
    });

    it('fetches namespaces once connected and offers them in the Namespace dropdown', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default', 'kube-system', 'my-app']);
      render(<CreatePage connected />);

      const namespaceInput = await screen.findByLabelText('Namespace');
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());
      fireEvent.click(namespaceInput);

      expect(await screen.findByRole('option', { name: 'default' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'kube-system' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'my-app' })).toBeInTheDocument();
    });

    it('selecting a discovered namespace sets it on the resource', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default', 'my-app']);
      vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
      render(<CreatePage connected />);

      const namespaceInput = await screen.findByLabelText('Namespace');
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());
      fireEvent.click(namespaceInput);
      fireEvent.click(await screen.findByRole('option', { name: 'my-app' }));

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'reader' } });
      fireEvent.click(screen.getByText('Preview & Dry-Run'));

      await waitFor(() => expect(api.dryRun).toHaveBeenCalledWith('roles', expect.objectContaining({ namespace: 'my-app' })));
    });

    it('still allows typing a namespace not returned by discovery', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default']);
      render(<CreatePage connected />);

      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());
      setNamespace('not-yet-created');

      expect(screen.getByLabelText('Namespace')).toHaveValue('not-yet-created');
    });

    it('shows a warning and still allows manual entry when namespace discovery fails', async () => {
      vi.mocked(api.getNamespaces).mockRejectedValue(new Error('forbidden'));
      render(<CreatePage connected />);

      expect(await screen.findByText(/Failed to load namespaces/)).toBeInTheDocument();
      setNamespace('default');
      expect(screen.getByLabelText('Namespace')).toHaveValue('default');
    });

    it('clears the loaded namespace list when the connection is dropped', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default']);
      const { rerender } = render(<CreatePage connected />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());

      rerender(<CreatePage connected={false} />);

      const namespaceInput = screen.getByLabelText('Namespace');
      fireEvent.click(namespaceInput);
      expect(screen.queryByRole('option', { name: 'default' })).not.toBeInTheDocument();
    });
  });
});
