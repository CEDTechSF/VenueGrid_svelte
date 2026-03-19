import { json } from '@sveltejs/kit';
import type { App } from '@sveltejs/kit';

/** Returns a 401/403 JSON response if the request is not from an authenticated admin, otherwise null. */
export function requireAdmin(locals: App.Locals): Response | null {
  if (!locals.user) return json({ error: 'Authentication required' }, { status: 401 });
  if (!locals.user.is_admin) return json({ error: 'Admin required' }, { status: 403 });
  return null;
}

/** Returns a 401 JSON response if the request is not from an authenticated user, otherwise null. */
export function requireAuth(locals: App.Locals): Response | null {
  if (!locals.user) return json({ error: 'Authentication required' }, { status: 401 });
  return null;
}
