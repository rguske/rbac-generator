// frontend/src/api/client.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getSession, getNamespaces, UNAUTHORIZED_EVENT } from './client';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('login posts credentials and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await login('admin', 's3cret');

    expect(result).toEqual({ authenticated: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'admin', password: 's3cret' }) }),
    );
  });

  it('throws with the server error message on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'invalid credentials' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('admin', 'wrong')).rejects.toThrow('invalid credentials');
  });

  it('dispatches UNAUTHORIZED_EVENT when an authenticated call gets a 401 (session expired)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'unauthorized' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(getNamespaces()).rejects.toThrow();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it('does NOT dispatch UNAUTHORIZED_EVENT for a plain login failure (wrong credentials)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'invalid credentials' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(login('admin', 'wrong')).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it('getSession returns the default state on a fresh session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: false, connected: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getSession();

    expect(result.authenticated).toBe(false);
  });
});
