import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowsePage } from './Browse';
import * as api from '../api/client';

vi.mock('../api/client');

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('lists resources for the selected kind', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    render(<BrowsePage connected />);
    await waitFor(() => expect(screen.getByText('reader')).toBeInTheDocument());
    expect(api.listResources).toHaveBeenCalledWith('roles', undefined);
  });

  it('shows resource YAML in the drawer when a row is clicked', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    vi.spyOn(api, 'getResource').mockResolvedValue({ name: 'reader', namespace: 'default', rules: [] });
    render(<BrowsePage connected />);
    await waitFor(() => screen.getByText('reader'));

    fireEvent.click(screen.getByText('reader'));

    await waitFor(() => expect(screen.getByTestId('yaml-drawer')).toBeInTheDocument());
    expect(api.getResource).toHaveBeenCalledWith('roles', 'reader', 'default');
  });

  it('does not fetch a list when not connected', () => {
    render(<BrowsePage connected={false} />);
    expect(api.listResources).not.toHaveBeenCalled();
  });

  it('clears the YAML drawer when the kind filter changes', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    vi.spyOn(api, 'getResource').mockResolvedValue({ name: 'reader', namespace: 'default', rules: [] });
    render(<BrowsePage connected />);
    await waitFor(() => screen.getByText('reader'));

    fireEvent.click(screen.getByText('reader'));
    await waitFor(() => expect(screen.getByTestId('yaml-drawer')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Kind filter'), { target: { value: 'clusterroles' } });

    await waitFor(() => expect(screen.queryByTestId('yaml-drawer')).not.toBeInTheDocument());
  });

  it('closes the drawer when the close button is clicked', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    vi.spyOn(api, 'getResource').mockResolvedValue({ name: 'reader', namespace: 'default', rules: [] });
    render(<BrowsePage connected />);
    await waitFor(() => screen.getByText('reader'));

    fireEvent.click(screen.getByText('reader'));
    await waitFor(() => expect(screen.getByTestId('yaml-drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Close drawer panel'));

    await waitFor(() => expect(screen.queryByTestId('yaml-drawer')).not.toBeInTheDocument());
  });
});
