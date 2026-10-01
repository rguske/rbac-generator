import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TemplatesPage } from './Templates';
import { RBAC_TEMPLATES } from '../data/templates';
import * as api from '../api/client';

vi.mock('../api/client');

/** Types text into a template card's namespace field and commits it, like a user would. */
function setCardNamespace(card: HTMLElement, label: string, value: string) {
  const input = within(card).getByLabelText(label);
  fireEvent.click(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getNamespaces').mockResolvedValue([]);
  });

  it('renders a card for every persona template', () => {
    render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
    for (const template of RBAC_TEMPLATES) {
      expect(screen.getByTestId(`template-card-${template.id}`)).toBeInTheDocument();
      expect(screen.getByText(template.name)).toBeInTheDocument();
    }
  });

  it('calls onUseTemplate with a ClusterRole and the template rules when "Use as ClusterRole" is clicked', () => {
    const onUseTemplate = vi.fn();
    render(<TemplatesPage connected={false} onUseTemplate={onUseTemplate} />);
    const clusterAdmin = RBAC_TEMPLATES.find((t) => t.id === 'cluster-admin')!;
    const card = screen.getByTestId('template-card-cluster-admin');
    fireEvent.click(within(card).getByText('Use as ClusterRole'));
    expect(onUseTemplate).toHaveBeenCalledWith('clusterroles', { name: clusterAdmin.defaultName, rules: clusterAdmin.rules });
  });

  it('disables "Use as Role" until a namespace is entered', () => {
    render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
    const card = screen.getByTestId('template-card-cluster-viewer');
    expect(within(card).getByText('Use as Role').closest('button')).toBeDisabled();

    setCardNamespace(card, 'Cluster-Viewer namespace', 'team-a');
    expect(within(card).getByText('Use as Role').closest('button')).not.toBeDisabled();
  });

  it('calls onUseTemplate with a namespaced Role when "Use as Role" is clicked', () => {
    const onUseTemplate = vi.fn();
    render(<TemplatesPage connected={false} onUseTemplate={onUseTemplate} />);
    const vmAdmin = RBAC_TEMPLATES.find((t) => t.id === 'vm-admin')!;
    const card = screen.getByTestId('template-card-vm-admin');

    setCardNamespace(card, 'VirtualMachine-Admin namespace', 'vms');
    fireEvent.click(within(card).getByText('Use as Role'));

    expect(onUseTemplate).toHaveBeenCalledWith('roles', { name: vmAdmin.defaultName, namespace: 'vms', rules: vmAdmin.rules });
  });

  it('shows the apiGroups covered by each template as labels', () => {
    render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
    const card = screen.getByTestId('template-card-platform-operator');
    expect(within(card).getByText('core')).toBeInTheDocument();
    expect(within(card).getByText('apps')).toBeInTheDocument();
    expect(within(card).getByText('batch')).toBeInTheDocument();
  });

  it('colors the wildcard apiGroup label red and the core apiGroup label blue', () => {
    render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
    const clusterAdminCard = screen.getByTestId('template-card-cluster-admin');
    expect(within(clusterAdminCard).getByText('*').closest('.pf-v6-c-label')).toHaveClass('pf-m-red');

    const platformOperatorCard = screen.getByTestId('template-card-platform-operator');
    expect(within(platformOperatorCard).getByText('core').closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
  });

  it('gives the same apiGroup the same color wherever it appears, across different template cards', () => {
    render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
    const vmAdminCard = screen.getByTestId('template-card-vm-admin');
    const vmViewerCard = screen.getByTestId('template-card-vm-viewer');

    const adminLabel = within(vmAdminCard).getByText('kubevirt.io').closest('.pf-v6-c-label')!;
    const viewerLabel = within(vmViewerCard).getByText('kubevirt.io').closest('.pf-v6-c-label')!;

    // Deterministically derived from the group name, and not grey (the
    // Label default when no color is set) — proves a non-default color was
    // actually chosen, not left at the default.
    expect(adminLabel).toHaveClass('pf-m-teal');
    expect(viewerLabel).toHaveClass('pf-m-teal');
  });

  describe('namespace discovery', () => {
    it('does not fetch namespaces while disconnected', () => {
      render(<TemplatesPage connected={false} onUseTemplate={() => {}} />);
      expect(api.getNamespaces).not.toHaveBeenCalled();
    });

    it('fetches namespaces once connected and offers them in every card\'s namespace dropdown', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default', 'team-a']);
      render(<TemplatesPage connected onUseTemplate={() => {}} />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());

      const card = screen.getByTestId('template-card-cluster-viewer');
      fireEvent.click(within(card).getByLabelText('Cluster-Viewer namespace'));

      // The option list renders via a portal, so it isn't inside `card`'s
      // own DOM subtree — query the whole document instead of `within(card)`.
      expect(await screen.findByRole('option', { name: 'default' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'team-a' })).toBeInTheDocument();
    });

    it('fetches namespaces only once for the whole page, not once per card', async () => {
      vi.mocked(api.getNamespaces).mockResolvedValue(['default']);
      render(<TemplatesPage connected onUseTemplate={() => {}} />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());
      expect(api.getNamespaces).toHaveBeenCalledTimes(1);
    });

    it('still allows typing a namespace not returned by discovery', () => {
      render(<TemplatesPage connected onUseTemplate={() => {}} />);
      const card = screen.getByTestId('template-card-cluster-viewer');

      setCardNamespace(card, 'Cluster-Viewer namespace', 'not-yet-created');

      expect(within(card).getByLabelText('Cluster-Viewer namespace')).toHaveValue('not-yet-created');
      expect(within(card).getByText('Use as Role').closest('button')).not.toBeDisabled();
    });

    it('shows a warning and still allows manual entry when namespace discovery fails', async () => {
      vi.mocked(api.getNamespaces).mockRejectedValue(new Error('forbidden'));
      render(<TemplatesPage connected onUseTemplate={() => {}} />);

      expect(await screen.findByText(/Failed to load namespaces/)).toBeInTheDocument();
      const card = screen.getByTestId('template-card-cluster-viewer');
      setCardNamespace(card, 'Cluster-Viewer namespace', 'default');
      expect(within(card).getByLabelText('Cluster-Viewer namespace')).toHaveValue('default');
    });
  });
});
