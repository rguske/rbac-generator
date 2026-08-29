import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as api from './api/client';

vi.mock('./api/client');

describe('App', () => {
  it('shows the login page when the session is unauthenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: false, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log in to rbac-generator')).toBeInTheDocument());
  });

  it('shows the app shell when the session is authenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('rbac-generator')).toBeInTheDocument());
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
  });

  it('switches views when a nav item is clicked', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: [] });
    render(<App />);
    await waitFor(() => screen.getByText('Create'));
    fireEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Preview & Dry-Run')).toBeInTheDocument();
  });
});
