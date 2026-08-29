// frontend/src/api/client.ts
import type { RbacResource, Kind, DiscoveryResponse, ClusterInfo, SessionInfo } from '../types/rbac';

/**
 * Dispatched whenever any API call receives a 401 (e.g. the server-side
 * session expired via its TTL janitor while the frontend still believed it
 * was authenticated). App.tsx listens for this to reset auth state and
 * fall back to the Login page, rather than leaving the user stuck on a
 * page that silently keeps failing.
 */
export const UNAUTHORIZED_EVENT = 'rbac-generator:unauthorized';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (res.status === 401 && path !== '/api/login') {
    // A 401 from /api/login just means "wrong credentials" while already on
    // the Login page; only a 401 from an already-authenticated call means
    // the session actually expired.
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function login(username: string, password: string): Promise<{ authenticated: boolean }> {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<void> {
  return request('/api/logout', { method: 'POST' });
}

export function getSession(): Promise<SessionInfo> {
  return request('/api/session');
}

export function connect(kubeconfig: string): Promise<ClusterInfo> {
  return request('/api/connection', { method: 'POST', body: JSON.stringify({ kubeconfig }) });
}

export function disconnect(): Promise<void> {
  return request('/api/connection', { method: 'DELETE' });
}

export function getDiscoveryResources(): Promise<DiscoveryResponse> {
  return request('/api/discovery/resources');
}

export function getNamespaces(): Promise<string[]> {
  return request('/api/namespaces');
}

export function getServiceAccounts(namespace: string): Promise<string[]> {
  return request(`/api/namespaces/${encodeURIComponent(namespace)}/serviceaccounts`);
}

export function dryRun(kind: Kind, resource: RbacResource): Promise<unknown> {
  return request(`/api/rbac/${kind}/dry-run`, { method: 'POST', body: JSON.stringify(resource) });
}

export function createResource(kind: Kind, resource: RbacResource): Promise<unknown> {
  return request(`/api/rbac/${kind}`, { method: 'POST', body: JSON.stringify(resource) });
}

export function listResources(kind: Kind, namespace?: string): Promise<RbacResource[]> {
  const qs = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
  return request(`/api/rbac/${kind}${qs}`);
}

export function getResource(kind: Kind, name: string, namespace?: string): Promise<RbacResource> {
  const path = namespace
    ? `/api/rbac/${kind}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
    : `/api/rbac/${kind}/${encodeURIComponent(name)}`;
  return request(path);
}
