import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from './Templates';
import { RBAC_TEMPLATES } from '../data/templates';

describe('TemplatesPage', () => {
  it('renders a card for every persona template', () => {
    render(<TemplatesPage onUseTemplate={() => {}} />);
    for (const template of RBAC_TEMPLATES) {
      expect(screen.getByTestId(`template-card-${template.id}`)).toBeInTheDocument();
      expect(screen.getByText(template.name)).toBeInTheDocument();
    }
  });

  it('calls onUseTemplate with a ClusterRole and the template rules when "Use as ClusterRole" is clicked', () => {
    const onUseTemplate = vi.fn();
    render(<TemplatesPage onUseTemplate={onUseTemplate} />);
    const clusterAdmin = RBAC_TEMPLATES.find((t) => t.id === 'cluster-admin')!;
    const card = screen.getByTestId('template-card-cluster-admin');
    fireEvent.click(within(card).getByText('Use as ClusterRole'));
    expect(onUseTemplate).toHaveBeenCalledWith('clusterroles', { name: clusterAdmin.defaultName, rules: clusterAdmin.rules });
  });

  it('disables "Use as Role" until a namespace is entered', () => {
    render(<TemplatesPage onUseTemplate={() => {}} />);
    const card = screen.getByTestId('template-card-cluster-viewer');
    expect(within(card).getByText('Use as Role').closest('button')).toBeDisabled();

    fireEvent.change(within(card).getByLabelText('Cluster-Viewer namespace'), { target: { value: 'team-a' } });
    expect(within(card).getByText('Use as Role').closest('button')).not.toBeDisabled();
  });

  it('calls onUseTemplate with a namespaced Role when "Use as Role" is clicked', () => {
    const onUseTemplate = vi.fn();
    render(<TemplatesPage onUseTemplate={onUseTemplate} />);
    const vmAdmin = RBAC_TEMPLATES.find((t) => t.id === 'vm-admin')!;
    const card = screen.getByTestId('template-card-vm-admin');

    fireEvent.change(within(card).getByLabelText('VirtualMachine-Admin namespace'), { target: { value: 'vms' } });
    fireEvent.click(within(card).getByText('Use as Role'));

    expect(onUseTemplate).toHaveBeenCalledWith('roles', { name: vmAdmin.defaultName, namespace: 'vms', rules: vmAdmin.rules });
  });

  it('shows the apiGroups covered by each template as labels', () => {
    render(<TemplatesPage onUseTemplate={() => {}} />);
    const card = screen.getByTestId('template-card-platform-operator');
    expect(within(card).getByText('core')).toBeInTheDocument();
    expect(within(card).getByText('apps')).toBeInTheDocument();
    expect(within(card).getByText('batch')).toBeInTheDocument();
  });

  it('colors the wildcard apiGroup label red and the core apiGroup label blue', () => {
    render(<TemplatesPage onUseTemplate={() => {}} />);
    const clusterAdminCard = screen.getByTestId('template-card-cluster-admin');
    expect(within(clusterAdminCard).getByText('*').closest('.pf-v6-c-label')).toHaveClass('pf-m-red');

    const platformOperatorCard = screen.getByTestId('template-card-platform-operator');
    expect(within(platformOperatorCard).getByText('core').closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
  });

  it('gives the same apiGroup the same color wherever it appears, across different template cards', () => {
    render(<TemplatesPage onUseTemplate={() => {}} />);
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
});
