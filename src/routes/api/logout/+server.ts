import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession } from '$lib/server/session.js';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (locals.sessionId) destroySession(locals.sessionId, cookies);
  return json({ success: true });
};
