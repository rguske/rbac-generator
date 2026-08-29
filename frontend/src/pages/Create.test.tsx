import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CreatePage } from './Create';
import * as api from '../api/client';

vi.mock('../api/client');

describe('CreatePage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: ['get', 'list'] });
  });

  it('disables Dry-Run and Apply when not connected', () => {
    render(<CreatePage connected={false} />);
    expect(screen.getByText('Preview & Dry-Run').closest('button')).toBeDisabled();
    expect(screen.getByText('Apply').closest('button')).toBeDisabled();
  });

  it('enables Apply only after a successful dry-run', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    render(<CreatePage connected />);

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    const namespaceInput = screen.getByRole('textbox', { name: 'Namespace' });
    
    fireEvent.change(nameInput, { target: { value: 'reader' } });
    fireEvent.change(namespaceInput, { target: { value: 'default' } });
    fireEvent.click(screen.getByText('Preview & Dry-Run'));

    await waitFor(() => expect(screen.getByText('Apply').closest('button')).not.toBeDisabled());
    expect(api.dryRun).toHaveBeenCalledWith('roles', expect.objectContaining({ name: 'reader', namespace: 'default' }));
  });

  it('calls createResource with the built resource on Apply', async () => {
    vi.spyOn(api, 'dryRun').mockResolvedValue({ status: 'ok' });
    vi.spyOn(api, 'createResource').mockResolvedValue({});
    render(<CreatePage connected />);

    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    const namespaceInput = screen.getByRole('textbox', { name: 'Namespace' });
    
    fireEvent.change(nameInput, { target: { value: 'reader' } });
    fireEvent.change(namespaceInput, { target: { value: 'default' } });
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
});
