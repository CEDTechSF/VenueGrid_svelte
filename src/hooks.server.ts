import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import type { User } from '$lib/types.js';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('sid') ?? null;

  if (sessionId) {
    try {
      const db = getDb();
      const session = db
        .prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?')
        .get(sessionId, Date.now()) as { user_id: number } | undefined;

      if (session) {
        const user = db
          .prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?')
          .get(session.user_id) as User | undefined;
        event.locals.user = user ?? null;
        event.locals.sessionId = sessionId;
      } else {
        event.locals.user = null;
        event.locals.sessionId = null;
      }
    } catch {
      event.locals.user = null;
      event.locals.sessionId = null;
    }
  } else {
    event.locals.user = null;
    event.locals.sessionId = null;
  }

  return resolve(event);
};
