import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { serverCtx } from './context';
import { assertSameOrigin } from './http';
import { sessionActor } from './session';

/**
 * Every team function runs behind this. It establishes who is asking; the domain
 * functions then check that person's membership for the ids they were given.
 */
export const teamMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    assertSameOrigin();
    const actor = await sessionActor(getRequest().headers);
    return next({ context: { actor, ctx: serverCtx() } });
  }
);
