// frontend/src/pages/Connection.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionPage } from './Connection';
import * as api from '../api/client';

vi.mock('../api/client');

describe('ConnectionPage', () => {
  it('shows the connect form when there is no cluster info', () => {
    render(<ConnectionPage onConnected={() => {}} onDisconnected={() => {}} />);
    expect(screen.getByText('Connect to a cluster')).toBeInTheDocument();
  });

  it('shows connected details and a Disconnect button when cluster info is provided', () => {
    render(
      <ConnectionPage
        clusterInfo={{ server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' }}
        onConnected={() => {}}
        onDisconnected={() => {}}
      />,
    );
    expect(screen.getByText('https://x:6443')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('calls onConnected with the response after a successful connect', async () => {
    const info = { server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' };
    vi.spyOn(api, 'connect').mockResolvedValue(info);
    const onConnected = vi.fn();
    render(<ConnectionPage onConnected={onConnected} onDisconnected={() => {}} />);

    fireEvent.change(screen.getByLabelText('kubeconfig-text'), { target: { value: 'apiVersion: v1' } });
    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(info));
  });

  it('calls onDisconnected after clicking Disconnect', async () => {
    vi.spyOn(api, 'disconnect').mockResolvedValue(undefined);
    const onDisconnected = vi.fn();
    render(
      <ConnectionPage
        clusterInfo={{ server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' }}
        onConnected={() => {}}
        onDisconnected={onDisconnected}
      />,
    );

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => expect(onDisconnected).toHaveBeenCalled());
  });
});
