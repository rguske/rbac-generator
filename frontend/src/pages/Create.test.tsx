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
    vi.spyOn(api, 'getUsers').mockResolvedValue([]);
    vi.spyOn(api, 'getGroups').mockResolvedValue([]);
  });

  /** Switches to ClusterRoleBinding (which requires subjects), adds a subject row, and sets its kind. */
  const addSubjectOfKind = (subjectKind: 'User' | 'Group') => {
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'clusterrolebindings' } });
    fireEvent.click(screen.getByText('Add subject'));
    fireEvent.change(screen.getByLabelText('subject-kind-0'), { target: { value: subjectKind } });
  };

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

  describe('user/group discovery', () => {
    it('does not fetch users or groups for a kind that does not require subjects', () => {
      const getUsersSpy = vi.mocked(api.getUsers);
      const getGroupsSpy = vi.mocked(api.getGroups);
      getUsersSpy.mockClear();
      getGroupsSpy.mockClear();
      render(<CreatePage connected />);
      expect(getUsersSpy).not.toHaveBeenCalled();
      expect(getGroupsSpy).not.toHaveBeenCalled();
    });

    it('fetches users and groups once switched to a binding kind, and offers them in the Subjects dropdown', async () => {
      vi.mocked(api.getUsers).mockResolvedValue(['alice', 'bob']);
      vi.mocked(api.getGroups).mockResolvedValue(['cluster-admins']);
      render(<CreatePage connected />);

      addSubjectOfKind('User');
      await waitFor(() => expect(api.getUsers).toHaveBeenCalled());
      fireEvent.click(screen.getByLabelText('subject-name-0'));

      expect(await screen.findByRole('option', { name: 'alice' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'bob' })).toBeInTheDocument();
    });

    it('selecting a discovered User sets it on the subject', async () => {
      vi.mocked(api.getUsers).mockResolvedValue(['alice']);
      render(<CreatePage connected />);

      addSubjectOfKind('User');
      await waitFor(() => expect(api.getUsers).toHaveBeenCalled());
      fireEvent.click(screen.getByLabelText('subject-name-0'));
      fireEvent.click(await screen.findByRole('option', { name: 'alice' }));

      expect(screen.getByLabelText('subject-name-0')).toHaveValue('alice');
    });

    it('still allows typing a custom Group name not returned by discovery', async () => {
      vi.mocked(api.getGroups).mockResolvedValue(['cluster-admins']);
      render(<CreatePage connected />);

      addSubjectOfKind('Group');
      await waitFor(() => expect(api.getGroups).toHaveBeenCalled());
      const nameInput = screen.getByLabelText('subject-name-0');
      fireEvent.click(nameInput);
      fireEvent.change(nameInput, { target: { value: 'not-yet-synced' } });
      fireEvent.click(await screen.findByRole('option', { name: 'Use "not-yet-synced"' }));

      expect(screen.getByLabelText('subject-name-0')).toHaveValue('not-yet-synced');
    });

    it('shows warnings and still allows manual entry when user/group discovery fails', async () => {
      vi.mocked(api.getUsers).mockRejectedValue(new Error('no such API group'));
      vi.mocked(api.getGroups).mockRejectedValue(new Error('no such API group'));
      render(<CreatePage connected />);

      addSubjectOfKind('User');

      expect(await screen.findByText(/Failed to load users/)).toBeInTheDocument();
      expect(await screen.findByText(/Failed to load groups/)).toBeInTheDocument();
      const nameInput = screen.getByLabelText('subject-name-0');
      fireEvent.click(nameInput);
      fireEvent.change(nameInput, { target: { value: 'alice' } });
      fireEvent.click(await screen.findByRole('option', { name: 'Use "alice"' }));
      expect(nameInput).toHaveValue('alice');
    });

    it('refetches users/groups after switching away to a non-subjects kind and back', async () => {
      const getUsersSpy = vi.mocked(api.getUsers).mockResolvedValue(['alice']);
      getUsersSpy.mockClear();
      render(<CreatePage connected />);

      addSubjectOfKind('User');
      await waitFor(() => expect(getUsersSpy).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'roles' } });
      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'clusterrolebindings' } });

      await waitFor(() => expect(getUsersSpy).toHaveBeenCalledTimes(2));
    });
  });
});
