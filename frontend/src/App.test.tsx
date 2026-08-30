import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as api from './api/client';

vi.mock('./api/client');

// vi.mock() automocks all exports, including the plain string constant
// UNAUTHORIZED_EVENT; pull the real value so the dispatched event name
// matches exactly what App.tsx's listener (using the same, mocked, import)
// resolves to at runtime.
const { UNAUTHORIZED_EVENT } = await vi.importActual<typeof import('./api/client')>('./api/client');

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  it('shows the login page when the session is unauthenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: false, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Log in to RBAC-Generator')).toBeInTheDocument());
  });

  it('shows the app shell when the session is authenticated', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => expect(screen.getByText('RBAC-Generator')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'RBAC-Generator logo' })).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
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

  it('navigates to Create prefilled when a template is used from the Templates page', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    vi.spyOn(api, 'getDiscoveryResources').mockResolvedValue({ source: 'static', resources: [], verbs: [] });
    render(<App />);
    await waitFor(() => screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Templates'));

    const card = screen.getByTestId('template-card-cluster-admin');
    fireEvent.click(within(card).getByText('Use as ClusterRole'));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('cluster-admin'));
    expect(screen.getByLabelText('Kind')).toHaveValue('clusterroles');
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
    await waitFor(() => expect(screen.getByText('Log in to RBAC-Generator')).toBeInTheDocument());

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
    await waitFor(() => screen.getByText('RBAC-Generator'));

    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });

    await waitFor(() => expect(screen.getByText('Log in to RBAC-Generator')).toBeInTheDocument());
  });

  it('shows a subtitle and version badge in the masthead', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => screen.getByText('RBAC-Generator'));
    expect(screen.getByText('Build and apply Kubernetes RBAC resources.')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
  });

  it('shows a GitHub link in the masthead pointing at the repo', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => screen.getByText('RBAC-Generator'));
    const link = screen.getByRole('link', { name: 'View source on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/rguske/rbac-generator');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('toggles dark mode on the document root when the theme button is clicked', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    render(<App />);
    await waitFor(() => screen.getByText('RBAC-Generator'));

    expect(document.documentElement.classList.contains('pf-v6-theme-dark')).toBe(false);

    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    expect(document.documentElement.classList.contains('pf-v6-theme-dark')).toBe(true);

    fireEvent.click(screen.getByLabelText('Switch to light mode'));
    expect(document.documentElement.classList.contains('pf-v6-theme-dark')).toBe(false);
  });

  it('persists the theme choice across reloads', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue({ authenticated: true, connected: false });
    const { unmount } = render(<App />);
    await waitFor(() => screen.getByText('RBAC-Generator'));

    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    unmount();

    render(<App />);
    await waitFor(() => screen.getByText('RBAC-Generator'));
    expect(document.documentElement.classList.contains('pf-v6-theme-dark')).toBe(true);
  });
});
