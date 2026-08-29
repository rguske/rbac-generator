import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as api from './api/client';

vi.mock('./api/client');

// vi.mock() automocks all exports, including the plain string constant
// UNAUTHORIZED_EVENT; pull the real value so the dispatched event name
// matches exactly what App.tsx's listener (using the same, mocked, import)
// resolves to at runtime.
const { UNAUTHORIZED_EVENT } = await vi.importActual<typeof import('./api/client')>('./api/client');

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
    expect(screen.getByRole('img', { name: 'rbac-generator logo' })).toBeInTheDocument();
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

  it('resets to the Connection view on logout', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: [] });
    vi.spyOn(api, 'logout').mockResolvedValue(undefined);
    vi.spyOn(api, 'login').mockResolvedValue({ authenticated: true });
    render(<App />);
    await waitFor(() => screen.getByText('Create'));

    fireEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Preview & Dry-Run')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Log out'));
    await waitFor(() => expect(screen.getByText('Log in to rbac-generator')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => screen.getByText('Connection'));
    expect(screen.queryByText('Preview & Dry-Run')).not.toBeInTheDocument();
  });

  it('falls back to the Login page when any API call reports the session as unauthorized', async () => {
    // Simulates the server-side session TTL expiring while this tab still
    // believes it's authenticated: a later API call (from api/client.ts)
    // gets a 401 and dispatches UNAUTHORIZED_EVENT.
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: [] });
    render(<App />);
    await waitFor(() => screen.getByText('rbac-generator'));

    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });

    await waitFor(() => expect(screen.getByText('Log in to rbac-generator')).toBeInTheDocument());
  });
});
