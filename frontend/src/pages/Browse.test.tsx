import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowsePage } from './Browse';
import * as api from '../api/client';

vi.mock('../api/client');

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getNamespaces').mockResolvedValue([]);
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

  it('copies the YAML to the clipboard when the copy button is clicked', async () => {
    vi.spyOn(api, 'listResources').mockResolvedValue([{ name: 'reader', namespace: 'default' }]);
    vi.spyOn(api, 'getResource').mockResolvedValue({ name: 'reader', namespace: 'default', rules: [] });
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BrowsePage connected />);
    await waitFor(() => screen.getByText('reader'));

    fireEvent.click(screen.getByText('reader'));
    await waitFor(() => expect(screen.getByTestId('yaml-drawer')).toBeInTheDocument());

    const yamlText = screen.getByTestId('yaml-drawer').textContent;
    fireEvent.click(screen.getByLabelText('Copy YAML to clipboard'));

    expect(writeText).toHaveBeenCalledWith(yamlText);
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

  describe('namespace discovery', () => {
    it('does not fetch namespaces while disconnected', () => {
      render(<BrowsePage connected={false} />);
      expect(api.getNamespaces).not.toHaveBeenCalled();
    });

    it('fetches namespaces once connected and offers them in the namespace filter dropdown', async () => {
      vi.spyOn(api, 'listResources').mockResolvedValue([]);
      vi.spyOn(api, 'getNamespaces').mockResolvedValue(['default', 'kube-system']);
      render(<BrowsePage connected />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());

      fireEvent.click(screen.getByLabelText('Namespace filter'));

      expect(await screen.findByRole('option', { name: 'default' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'kube-system' })).toBeInTheDocument();
    });

    it('selecting a discovered namespace filters the resource list', async () => {
      const listResourcesSpy = vi.spyOn(api, 'listResources').mockResolvedValue([]);
      vi.spyOn(api, 'getNamespaces').mockResolvedValue(['default', 'kube-system']);
      render(<BrowsePage connected />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());

      fireEvent.click(screen.getByLabelText('Namespace filter'));
      fireEvent.click(await screen.findByRole('option', { name: 'kube-system' }));

      await waitFor(() => expect(listResourcesSpy).toHaveBeenCalledWith('roles', 'kube-system'));
    });

    it('still allows typing a namespace not returned by discovery', async () => {
      vi.spyOn(api, 'listResources').mockResolvedValue([]);
      vi.spyOn(api, 'getNamespaces').mockResolvedValue(['default']);
      render(<BrowsePage connected />);
      await waitFor(() => expect(api.getNamespaces).toHaveBeenCalled());

      const input = screen.getByLabelText('Namespace filter');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'not-yet-created' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByLabelText('Namespace filter')).toHaveValue('not-yet-created');
    });

    it('shows a warning and still allows manual entry when namespace discovery fails', async () => {
      vi.spyOn(api, 'listResources').mockResolvedValue([]);
      vi.spyOn(api, 'getNamespaces').mockRejectedValue(new Error('forbidden'));
      render(<BrowsePage connected />);

      expect(await screen.findByText(/Failed to load namespaces/)).toBeInTheDocument();

      const input = screen.getByLabelText('Namespace filter');
      fireEvent.click(input);
      fireEvent.change(input, { target: { value: 'default' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByLabelText('Namespace filter')).toHaveValue('default');
    });
  });
});
