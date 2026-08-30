// frontend/src/pages/Login.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPageContainer } from './Login';
import * as api from '../api/client';

vi.mock('../api/client');

describe('LoginPageContainer', () => {
  it('shows the RBAC-Generator logo', () => {
    render(<LoginPageContainer onLoggedIn={() => {}} />);
    expect(screen.getByRole('img', { name: 'RBAC-Generator logo' })).toBeInTheDocument();
  });

  it('does not render a background image; the page uses a plain, theme-aware color instead', () => {
    const { container } = render(<LoginPageContainer onLoggedIn={() => {}} />);
    expect(container.querySelector('.pf-v6-c-background-image')).not.toBeInTheDocument();
  });

  it('calls onLoggedIn after a successful login', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({ authenticated: true });
    const onLoggedIn = vi.fn();
    render(<LoginPageContainer onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByLabelText('Username', { exact: false }), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password', { exact: false }), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
    expect(api.login).toHaveBeenCalledWith('admin', 's3cret');
  });

  it('shows an error message when login fails', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('invalid credentials'));
    render(<LoginPageContainer onLoggedIn={() => {}} />);

    fireEvent.change(screen.getByLabelText('Username', { exact: false }), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password', { exact: false }), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(screen.getByText('invalid credentials')).toBeInTheDocument());
  });
});
