// frontend/src/pages/Connection.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPage } from './Connection';
import * as api from '../api/client';

vi.mock('../api/client');

function mockFileReader(fileContent: string) {
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;

    readAsText(_file: File) {
      this.result = fileContent;
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }

  vi.stubGlobal('FileReader', MockFileReader);
}

describe('ConnectionPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
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

  it('populates kubeconfig from a selected file and connects with its content', async () => {
    const fileContent = 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://x:6443';
    mockFileReader(fileContent);

    const info = { server: 'https://x:6443', version: 'v1.30.0', currentContext: 'ctx' };
    vi.spyOn(api, 'connect').mockResolvedValue(info);
    const onConnected = vi.fn();
    const { container } = render(<ConnectionPage onConnected={onConnected} onDisconnected={() => {}} />);

    const file = new File([fileContent], 'kubeconfig.yaml', { type: 'application/x-yaml' });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('Connect')).not.toBeDisabled());

    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() => {
      expect(api.connect).toHaveBeenCalledWith(fileContent);
      expect(onConnected).toHaveBeenCalledWith(info);
    });
  });

  it('shows the selected kubeconfig filename after file upload', async () => {
    const fileContent = 'apiVersion: v1';
    mockFileReader(fileContent);

    const { container } = render(<ConnectionPage onConnected={() => {}} onDisconnected={() => {}} />);

    const file = new File([fileContent], 'my-kubeconfig.yml', { type: 'application/x-yaml' });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByDisplayValue('my-kubeconfig.yml')).toBeInTheDocument());
  });
});
