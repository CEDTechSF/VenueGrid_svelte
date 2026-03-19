/** Typed fetch wrapper for VenueGrid API calls. Throws the JSON error body on non-OK responses. */
export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const withoutDoubleApi = withLeadingSlash.replace(/^\/api\/api\//, '/api/');
  const apiPath = withoutDoubleApi.startsWith('/api/') ? withoutDoubleApi : '/api' + withoutDoubleApi;
  const res = await fetch(apiPath, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message) ||
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error) ||
      res.statusText ||
      'Request failed';
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}
