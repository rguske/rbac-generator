// frontend/src/api/client.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getSession } from './client';

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
