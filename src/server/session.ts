import { auth } from '~/lib/auth';
import type { Actor } from '~/domain/context';
import { AppError } from '~/domain/errors';

/** The signed-in person, from the verified session and nothing the browser says. */
export async function sessionActor(headers: Headers): Promise<Actor> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError('Please sign in.', 'unauthorized', 401);
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email
  };
}
