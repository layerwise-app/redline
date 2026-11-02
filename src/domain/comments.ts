import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  activity,
  assets,
  comments,
  guests,
  pages,
  reviewLinks,
  reviews,
  versions,
  workspaces
} from '~/db/schema';
import { redline } from '~/redline.config';
import { requireComment, requireVersion } from './access';
import type { Actor, Ctx } from './context';
import { sendClientEmail } from './email';
import { replyEmail } from './email-templates';
import { AppError, notFound } from './errors';
import { claimThrottle, releaseThrottle } from './rate-limit';
import { touchReview } from './reviews';
import * as v from './validate';

/**
 * Pins are numbered within a version, in two separate series. If internal pins
 * shared numbers with client pins, guests would see gaps and could tell that
 * hidden comments exist.
 */
export const nextPin = (versionId: string, internal: boolean) =>
  sql<number>`(SELECT COALESCE(MAX(${comments.pinNumber}), 0) + 1 FROM ${comments} WHERE ${comments.versionId} = ${versionId} AND ${comments.internal} = ${internal ? 1 : 0} AND ${comments.parentId} IS NULL)`;

export async function pageExists(ctx: Ctx, versionId: string, pageNumber: number) {
  const [page] = await ctx.db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.versionId, versionId), eq(pages.number, pageNumber)))
    .limit(1);
  return Boolean(page);
}

export type NewPin = {
  versionId: string;
  pageNumber: number;
  x: number;
  y: number;
  body: string;
  internal: boolean;
};

export async function teamAddComment(ctx: Ctx, actor: Actor, input: NewPin) {
  const version = await requireVersion(ctx, actor, input.versionId);
  if (!(await pageExists(ctx, version.id, input.pageNumber))) throw notFound();
  const internal = input.internal === true;
  const id = crypto.randomUUID();
  await ctx.db.insert(comments).values({
    id,
    workspaceId: version.workspaceId,
    reviewId: version.reviewId,
    assetId: version.assetId,
    versionId: version.id,
    pageNumber: input.pageNumber,
    pinNumber: nextPin(version.id, internal),
    x: v.parse(v.coordinate, input.x),
    y: v.parse(v.coordinate, input.y),
    body: v.parse(v.commentBody, input.body),
    authorKind: 'team',
    authorUserId: actor.id,
    authorName: actor.name,
    internal,
    createdAt: ctx.now()
  });
  await touchReview(ctx, version.reviewId);
  return { id };
}

/** The reply's thread root, whichever comment in the thread was named. */
async function threadRoot(ctx: Ctx, parentId: string | null) {
  if (!parentId) return null;
  const [row] = await ctx.db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      internal: comments.internal,
      deletedAt: comments.deletedAt
    })
    .from(comments)
    .where(eq(comments.id, parentId));
  return row ?? null;
}

export async function teamReply(
  ctx: Ctx,
  actor: Actor,
  input: { parentId: string; body: string; internal: boolean }
): Promise<{ id: string; notices: string[] }> {
  const parent = await requireComment(ctx, actor, input.parentId);
  const rootId = parent.parentId ?? parent.id;
  const root = await threadRoot(ctx, rootId);
  if (!root) throw notFound();
  // A reply inside an internal thread is internal, whatever the box said.
  const internal = root.internal || input.internal === true;
  const body = v.parse(v.commentBody, input.body);
  const id = crypto.randomUUID();
  await ctx.db.insert(comments).values({
    id,
    workspaceId: parent.workspaceId,
    reviewId: parent.reviewId,
    assetId: parent.assetId,
    versionId: parent.versionId,
    pageNumber: parent.pageNumber,
    parentId: rootId,
    body,
    authorKind: 'team',
    authorUserId: actor.id,
    authorName: actor.name,
    internal,
    createdAt: ctx.now()
  });
  await touchReview(ctx, parent.reviewId);
  // Internal replies stop here: no guest ever hears about them.
  const notices = internal
    ? []
    : await emailGuestsInThread(ctx, {
        rootId,
        workspaceId: parent.workspaceId,
        reviewId: parent.reviewId,
        assetId: parent.assetId,
        authorName: actor.name,
        body
      });
  return { id, notices };
}

/**
 * "Reply" email: goes to guests in the thread who left an address, and only from
 * a team member's action. At most once per review per hour per guest.
 */
async function emailGuestsInThread(
  ctx: Ctx,
  input: {
    rootId: string;
    workspaceId: string;
    reviewId: string;
    assetId: string;
    authorName: string;
    body: string;
  }
): Promise<string[]> {
  const notices: string[] = [];
  try {
    const rows = await ctx.db
      .select({ guestId: guests.id, email: guests.email })
      .from(comments)
      .innerJoin(guests, eq(guests.id, comments.guestId))
      .where(
        and(
          sql`(${comments.id} = ${input.rootId} OR ${comments.parentId} = ${input.rootId})`,
          eq(comments.internal, false)
        )
      );
    const seen = new Set<string>();
    const targets = rows.filter((row) => {
      if (!row.email || seen.has(row.guestId)) return false;
      seen.add(row.guestId);
      return true;
    });
    if (!targets.length) return notices;

    const [info] = await ctx.db
      .select({
        reviewName: reviews.name,
        workspaceName: workspaces.name,
        token: reviewLinks.token,
        revokedAt: reviewLinks.revokedAt,
        expiresAt: reviewLinks.expiresAt
      })
      .from(reviews)
      .innerJoin(workspaces, eq(workspaces.id, reviews.workspaceId))
      .innerJoin(reviewLinks, eq(reviewLinks.reviewId, reviews.id))
      .where(eq(reviews.id, input.reviewId));
    if (!info) return notices;
    // A dead link would email someone a page they can't open.
    if (
      info.revokedAt ||
      (info.expiresAt && info.expiresAt.getTime() <= ctx.now().getTime())
    ) {
      return ['No email sent: the review link is revoked or expired.'];
    }

    for (const target of targets) {
      const key = `reply:${input.reviewId}:${target.guestId}`;
      const claimed = await claimThrottle(ctx, key, redline.email.replyThrottleMs);
      if (!claimed) continue;
      const result = await sendClientEmail(
        ctx,
        {
          workspaceId: input.workspaceId,
          reviewId: input.reviewId,
          kind: 'reply',
          to: target.email!
        },
        replyEmail({
          workspace: info.workspaceName,
          review: info.reviewName,
          author: input.authorName,
          body: input.body,
          url: `${ctx.appUrl}/r/${info.token}?c=${input.rootId}`
        })
      );
      if (!result.sent) {
        await releaseThrottle(ctx, key);
        notices.push(`Reply saved, but ${target.email} wasn’t emailed. ${result.message}`);
      }
    }
  } catch (error) {
    // The reply is saved; email trouble never undoes it.
    console.warn('[email] reply notifications failed', error);
  }
  return notices;
}

export async function teamEditComment(
  ctx: Ctx,
  actor: Actor,
  input: { id: string; body: string }
) {
  const comment = await requireComment(ctx, actor, input.id);
  if (comment.authorUserId !== actor.id) {
    throw new AppError('You can only edit your own comments.', 'forbidden', 403);
  }
  await ctx.db
    .update(comments)
    .set({ body: v.parse(v.commentBody, input.body), editedAt: ctx.now() })
    .where(eq(comments.id, comment.id));
}

export async function removeComment(ctx: Ctx, commentId: string) {
  const [reply] = await ctx.db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.parentId, commentId), isNull(comments.deletedAt)))
    .limit(1);
  await ctx.db.delete(activity).where(eq(activity.commentId, commentId));
  if (reply) {
    // Replies still hang off it, so keep the pin and clear what was said.
    await ctx.db
      .update(comments)
      .set({ deletedAt: ctx.now(), body: '' })
      .where(eq(comments.id, commentId));
  } else {
    await ctx.db.delete(comments).where(eq(comments.id, commentId));
  }
}

/** The team can remove any comment, which is how they deal with spam. */
export async function teamDeleteComment(ctx: Ctx, actor: Actor, id: string) {
  const comment = await requireComment(ctx, actor, id);
  await removeComment(ctx, comment.id);
  await touchReview(ctx, comment.reviewId);
}

export async function teamSetResolved(
  ctx: Ctx,
  actor: Actor,
  input: { id: string; resolved: boolean }
) {
  const comment = await requireComment(ctx, actor, input.id);
  const rootId = comment.parentId ?? comment.id;
  await ctx.db
    .update(comments)
    .set(
      input.resolved
        ? { resolvedAt: ctx.now(), resolvedByName: actor.name }
        : { resolvedAt: null, resolvedByName: null }
    )
    .where(eq(comments.id, rootId));
  await touchReview(ctx, comment.reviewId);
}

export const excerpt = (body: string) =>
  body.length > 200 ? `${body.slice(0, 197)}…` : body;

export async function assetNameFor(ctx: Ctx, assetId: string) {
  const [asset] = await ctx.db
    .select({ name: assets.name })
    .from(assets)
    .where(eq(assets.id, assetId));
  return asset?.name ?? '';
}

export async function versionOfAsset(ctx: Ctx, versionId: string) {
  const [version] = await ctx.db
    .select({
      id: versions.id,
      number: versions.number,
      assetId: versions.assetId,
      reviewId: versions.reviewId,
      workspaceId: versions.workspaceId,
      status: versions.status
    })
    .from(versions)
    .where(eq(versions.id, versionId));
  return version ?? null;
}

