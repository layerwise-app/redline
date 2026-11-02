import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as guest from '~/domain/guest';
import { id } from '~/domain/validate';
import { previewInvite } from '~/domain/workspaces';
import { serverCtx } from './context';
import { assertSameOrigin, clientIp, cookieJar } from './http';

/**
 * Guest functions name a link token and nothing else about who they are. Each
 * domain function re-checks the link (revoked, expired, password) on every call.
 */
const guestMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    assertSameOrigin();
    return next({
      context: { ctx: serverCtx(), cookies: cookieJar(), ip: clientIp() }
    });
  }
);

const token = z.string().max(64);
const text = z.string().max(5000);

export const previewInviteFn = createServerFn({ method: 'GET' })
  .middleware([guestMiddleware])
  .validator(z.object({ token }))
  .handler(({ context, data }) => previewInvite(context.ctx, data.token));

export const guestLoadFn = createServerFn({ method: 'GET' })
  .middleware([guestMiddleware])
  .validator(z.object({ token }))
  .handler(({ context, data }) =>
    guest.guestLoad(context.ctx, data.token, context.cookies)
  );

export const unlockFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, password: z.string().max(200) }))
  .handler(({ context, data }) =>
    guest.unlockLink(
      context.ctx,
      { ...data, ip: context.ip },
      context.cookies
    )
  );

export const setIdentityFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(
    z.object({ token, name: text, email: z.string().max(320).nullable() })
  )
  .handler(({ context, data }) =>
    guest.guestSetIdentity(
      context.ctx,
      { ...data, ip: context.ip },
      context.cookies
    )
  );

export const guestAddPinFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(
    z.object({
      token,
      versionId: id,
      pageNumber: z.number(),
      x: z.number(),
      y: z.number(),
      body: text
    })
  )
  .handler(({ context, data }) =>
    guest.guestAddComment(
      context.ctx,
      { ...data, internal: false, ip: context.ip },
      context.cookies
    )
  );

export const guestReplyFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, parentId: id, body: text }))
  .handler(({ context, data }) =>
    guest.guestReply(context.ctx, { ...data, ip: context.ip }, context.cookies)
  );

export const guestEditFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, id, body: text }))
  .handler(({ context, data }) =>
    guest.guestEditComment(context.ctx, data, context.cookies)
  );

export const guestRemoveFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, id }))
  .handler(({ context, data }) =>
    guest.guestDeleteComment(context.ctx, data, context.cookies)
  );

export const guestResolveFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, id, resolved: z.boolean() }))
  .handler(({ context, data }) =>
    guest.guestSetResolved(context.ctx, data, context.cookies)
  );

export const guestDecideFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(
    z.object({
      token,
      assetId: id,
      versionId: id,
      decision: z.enum(['approved', 'changes_requested'])
    })
  )
  .handler(({ context, data }) =>
    guest.guestDecide(context.ctx, { ...data, ip: context.ip }, context.cookies)
  );

export const guestFeedbackFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token }))
  .handler(({ context, data }) =>
    guest.guestSendFeedback(
      context.ctx,
      { token: data.token, ip: context.ip },
      context.cookies
    )
  );

export const reportFn = createServerFn({ method: 'POST' })
  .middleware([guestMiddleware])
  .validator(z.object({ token, reason: z.string().max(40), details: text }))
  .handler(({ context, data }) =>
    guest.submitReport(context.ctx, { ...data, ip: context.ip })
  );
