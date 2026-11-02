import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  activity,
  activityReads,
  assets,
  comments,
  decisions,
  pages,
  rateLimits,
  reviewLinks,
  reviewRecipients,
  reviews,
  versions,
  workspaceMembers,
  workspaces
} from '~/db/schema';
import { redline } from '~/redline.config';
import {
  activeWorkspaceId,
  requireMember,
  requireReview,
  requireVersion,
  requireAsset
} from './access';
import type { Actor, Ctx } from './context';
import { hashPassword, randomToken } from './crypto';
import type { InboxItem, ReviewRow, ReviewSnapshot } from './dto';
import {
  emailErrorMessage,
  sendClientEmail,
  type EmailResult
} from './email';
import { newVersionEmail, shareEmail } from './email-templates';
import { AppError, notFound } from './errors';
import { buildSnapshot } from './snapshot';
import { assetStatus, reviewStatus } from './status';
import { deleteKeys } from './workspaces';
import * as v from './validate';

export async function createReview(
  ctx: Ctx,
  actor: Actor,
  input: { name: string; clientName: string }
) {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  await requireMember(ctx, actor, workspaceId);
  const now = ctx.now();
  const id = crypto.randomUUID();
  await ctx.db.batch([
    ctx.db.insert(reviews).values({
      id,
      workspaceId,
      name: v.parse(v.reviewName, input.name),
      clientName: v.parse(v.clientName, input.clientName),
      createdById: actor.id,
      lastActivityAt: now,
      createdAt: now
    }),
    ctx.db.insert(reviewLinks).values({
      reviewId: id,
      token: randomToken(),
      createdAt: now
    })
  ]);
  return { id };
}

export async function updateReview(
  ctx: Ctx,
  actor: Actor,
  input: { reviewId: string; name: string; clientName: string }
) {
  await requireReview(ctx, actor, input.reviewId);
  await ctx.db
    .update(reviews)
    .set({
      name: v.parse(v.reviewName, input.name),
      clientName: v.parse(v.clientName, input.clientName)
    })
    .where(eq(reviews.id, input.reviewId));
}

export async function deleteReview(ctx: Ctx, actor: Actor, reviewId: string) {
  await requireReview(ctx, actor, reviewId);
  const originals = await ctx.db
    .select({ key: versions.originalKey, id: versions.id })
    .from(versions)
    .where(eq(versions.reviewId, reviewId));
  const previews = originals.length
    ? await ctx.db
        .select({ key: pages.previewKey })
        .from(pages)
        .where(inArray(pages.versionId, originals.map((row) => row.id)))
    : [];
  await deleteKeys(ctx, [
    ...originals.map((row) => row.key),
    ...previews.map((row) => row.key)
  ]);
  await ctx.db.delete(reviews).where(eq(reviews.id, reviewId));
}

export async function deleteAsset(ctx: Ctx, actor: Actor, assetId: string) {
  const asset = await requireAsset(ctx, actor, assetId);
  const originals = await ctx.db
    .select({ key: versions.originalKey, id: versions.id })
    .from(versions)
    .where(eq(versions.assetId, assetId));
  const previews = originals.length
    ? await ctx.db
        .select({ key: pages.previewKey })
        .from(pages)
        .where(inArray(pages.versionId, originals.map((row) => row.id)))
    : [];
  await deleteKeys(ctx, [
    ...originals.map((row) => row.key),
    ...previews.map((row) => row.key)
  ]);
  await ctx.db.delete(assets).where(eq(assets.id, assetId));
  await touchReview(ctx, asset.reviewId);
}

export async function touchReview(ctx: Ctx, reviewId: string) {
  await ctx.db
    .update(reviews)
    .set({ lastActivityAt: ctx.now() })
    .where(eq(reviews.id, reviewId));
}

export async function teamSnapshot(
  ctx: Ctx,
  actor: Actor,
  reviewId: string
): Promise<ReviewSnapshot> {
  await requireReview(ctx, actor, reviewId);
  const snapshot = await buildSnapshot(ctx, reviewId, {
    kind: 'team',
    userId: actor.id
  });
  if (!snapshot) throw notFound();
  return snapshot;
}

/** Unread means: newer than this member's "read all" mark, with no read row. */
const unreadSince = (seenAt: Date | null) =>
  and(
    isNull(activityReads.activityId),
    seenAt ? gt(activity.createdAt, seenAt) : undefined
  );

const readsFor = (actor: Actor) =>
  and(
    eq(activityReads.activityId, activity.id),
    eq(activityReads.userId, actor.id)
  );

export async function listReviews(
  ctx: Ctx,
  actor: Actor
): Promise<ReviewRow[]> {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  const membership = await requireMember(ctx, actor, workspaceId);

  const rows = await ctx.db
    .select({
      id: reviews.id,
      name: reviews.name,
      clientName: reviews.clientName,
      lastActivityAt: reviews.lastActivityAt
    })
    .from(reviews)
    .where(eq(reviews.workspaceId, workspaceId))
    .orderBy(desc(reviews.lastActivityAt));
  if (!rows.length) return [];

  const assetRows = await ctx.db
    .select({
      id: assets.id,
      reviewId: assets.reviewId,
      currentVersionId: assets.currentVersionId
    })
    .from(assets)
    .where(eq(assets.workspaceId, workspaceId));
  const live = assetRows.filter((asset) => asset.currentVersionId);

  const decisionRows = await ctx.db
    .select({
      assetId: decisions.assetId,
      versionId: decisions.versionId,
      decision: decisions.decision,
      createdAt: decisions.createdAt
    })
    .from(decisions)
    .where(eq(decisions.workspaceId, workspaceId));

  const currentIds = new Set(live.map((asset) => asset.currentVersionId));
  const openRows = await ctx.db
    .select({ reviewId: comments.reviewId, versionId: comments.versionId })
    .from(comments)
    .where(
      and(
        eq(comments.workspaceId, workspaceId),
        isNull(comments.parentId),
        isNull(comments.resolvedAt),
        isNull(comments.deletedAt)
      )
    );

  const unreadRows = await ctx.db
    .select({
      reviewId: activity.reviewId,
      count: sql<number>`COUNT(*)`
    })
    .from(activity)
    .leftJoin(activityReads, readsFor(actor))
    .where(
      and(
        eq(activity.workspaceId, workspaceId),
        unreadSince(membership.inboxSeenAt)
      )
    )
    .groupBy(activity.reviewId);

  return rows.map((review) => {
    const own = live.filter((asset) => asset.reviewId === review.id);
    return {
      id: review.id,
      name: review.name,
      clientName: review.clientName,
      lastActivityAt: review.lastActivityAt.toISOString(),
      assetCount: own.length,
      status: reviewStatus(
        own.map((asset) =>
          assetStatus(
            asset.currentVersionId,
            decisionRows.filter((d) => d.assetId === asset.id)
          )
        )
      ),
      openComments: openRows.filter(
        (row) => row.reviewId === review.id && currentIds.has(row.versionId)
      ).length,
      unread: Number(
        unreadRows.find((row) => row.reviewId === review.id)?.count ?? 0
      )
    };
  });
}

// Inbox

export async function listInbox(
  ctx: Ctx,
  actor: Actor
): Promise<{ items: InboxItem[]; unread: number }> {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  const membership = await requireMember(ctx, actor, workspaceId);
  const seenAt = membership.inboxSeenAt;
  const rows = await ctx.db
    .select({
      id: activity.id,
      kind: activity.kind,
      reviewId: activity.reviewId,
      reviewName: reviews.name,
      clientName: reviews.clientName,
      assetId: activity.assetId,
      assetName: assets.name,
      versionNumber: activity.versionNumber,
      commentId: activity.commentId,
      decision: activity.decision,
      actorName: activity.actorName,
      excerpt: activity.excerpt,
      createdAt: activity.createdAt,
      readId: activityReads.activityId
    })
    .from(activity)
    .innerJoin(reviews, eq(reviews.id, activity.reviewId))
    .leftJoin(assets, eq(assets.id, activity.assetId))
    .leftJoin(activityReads, readsFor(actor))
    .where(eq(activity.workspaceId, workspaceId))
    .orderBy(desc(activity.createdAt))
    .limit(200);
  const items: InboxItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    reviewId: row.reviewId,
    reviewName: row.reviewName,
    clientName: row.clientName,
    assetId: row.assetId,
    assetName: row.assetName,
    versionNumber: row.versionNumber,
    commentId: row.commentId,
    decision: row.decision,
    actorName: row.actorName,
    excerpt: row.excerpt,
    createdAt: row.createdAt.toISOString(),
    unread:
      !row.readId &&
      (!seenAt || row.createdAt.getTime() > seenAt.getTime())
  }));
  return { items, unread: items.filter((item) => item.unread).length };
}

export async function markInboxRead(
  ctx: Ctx,
  actor: Actor,
  input: { ids: string[] }
) {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  await requireMember(ctx, actor, workspaceId);
  if (!input.ids.length) return;
  // Only activity in this workspace: read rows can't reach into another one.
  const owned = await ctx.db
    .select({ id: activity.id })
    .from(activity)
    .where(
      and(
        eq(activity.workspaceId, workspaceId),
        inArray(activity.id, input.ids.slice(0, 200))
      )
    );
  if (!owned.length) return;
  await ctx.db
    .insert(activityReads)
    .values(
      owned.map((row) => ({
        activityId: row.id,
        userId: actor.id,
        readAt: ctx.now()
      }))
    )
    .onConflictDoNothing();
}

export async function markInboxAllRead(ctx: Ctx, actor: Actor) {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  await requireMember(ctx, actor, workspaceId);
  await ctx.db
    .update(workspaceMembers)
    .set({ inboxSeenAt: ctx.now() })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    );
}

// Review link and Share dialog

export type RecipientDTO = {
  id: string;
  email: string;
  lastSentAt: string | null;
  lastStatus: string | null;
  /** A plain-language problem to show beside the address. */
  problem: string | null;
};

export type ShareState = {
  url: string;
  linkState: 'active' | 'revoked' | 'expired';
  hasPassword: boolean;
  expiresAt: string | null;
  allowDownloads: boolean;
  recipients: RecipientDTO[];
  /** Client emails left today, across the workspace. */
  clientEmailsLeft: number;
};

async function linkRow(ctx: Ctx, reviewId: string) {
  const [link] = await ctx.db
    .select()
    .from(reviewLinks)
    .where(eq(reviewLinks.reviewId, reviewId))
    .limit(1);
  if (!link) throw notFound();
  return link;
}

const problemFor = (status: string | null) =>
  !status || status === 'sent'
    ? null
    : emailErrorMessage(status as Parameters<typeof emailErrorMessage>[0]);

export async function getShareState(
  ctx: Ctx,
  actor: Actor,
  reviewId: string
): Promise<ShareState> {
  const review = await requireReview(ctx, actor, reviewId);
  const link = await linkRow(ctx, reviewId);
  const recipients = await ctx.db
    .select()
    .from(reviewRecipients)
    .where(eq(reviewRecipients.reviewId, reviewId))
    .orderBy(reviewRecipients.createdAt);
  const [budget] = await ctx.db
    .select({ count: rateLimits.count, resetAt: rateLimits.resetAt })
    .from(rateLimits)
    .where(eq(rateLimits.key, `email:client:${review.workspaceId}`));
  const used =
    budget && budget.resetAt > ctx.now().getTime() ? budget.count : 0;
  return {
    url: `${ctx.appUrl}/r/${link.token}`,
    linkState: link.revokedAt
      ? 'revoked'
      : link.expiresAt && link.expiresAt.getTime() <= ctx.now().getTime()
        ? 'expired'
        : 'active',
    hasPassword: Boolean(link.passwordHash),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    allowDownloads: link.allowDownloads,
    recipients: recipients.map((row) => ({
      id: row.id,
      email: row.email,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      lastStatus: row.lastStatus,
      problem: problemFor(row.lastStatus)
    })),
    clientEmailsLeft: Math.max(
      0,
      redline.email.clientEmailsPerWorkspacePerDay - used
    )
  };
}

export async function updateLink(
  ctx: Ctx,
  actor: Actor,
  input: {
    reviewId: string;
    /** Undefined leaves the password alone; null removes it. */
    password?: string | null;
    expiresAt?: string | null;
    allowDownloads?: boolean;
  }
) {
  await requireReview(ctx, actor, input.reviewId);
  const set: Partial<typeof reviewLinks.$inferInsert> = {};
  if (input.password !== undefined) {
    set.passwordHash =
      input.password === null
        ? null
        : await hashPassword(v.parse(v.linkPassword, input.password));
    set.passwordVersion = sql`${reviewLinks.passwordVersion} + 1` as unknown as number;
  }
  if (input.expiresAt !== undefined) {
    const expires = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expires && Number.isNaN(expires.getTime())) {
      throw new AppError('Choose a valid expiry date.');
    }
    set.expiresAt = expires;
  }
  if (input.allowDownloads !== undefined) {
    set.allowDownloads = input.allowDownloads;
  }
  if (Object.keys(set).length) {
    await ctx.db
      .update(reviewLinks)
      .set(set)
      .where(eq(reviewLinks.reviewId, input.reviewId));
  }
}

export async function revokeLink(ctx: Ctx, actor: Actor, reviewId: string) {
  await requireReview(ctx, actor, reviewId);
  await ctx.db
    .update(reviewLinks)
    .set({ revokedAt: ctx.now() })
    .where(eq(reviewLinks.reviewId, reviewId));
}

/** A new token replaces the old one, which stops working immediately. */
export async function issueNewLink(ctx: Ctx, actor: Actor, reviewId: string) {
  await requireReview(ctx, actor, reviewId);
  await ctx.db
    .update(reviewLinks)
    .set({ token: randomToken(), revokedAt: null })
    .where(eq(reviewLinks.reviewId, reviewId));
}

export async function addRecipient(
  ctx: Ctx,
  actor: Actor,
  input: { reviewId: string; email: string }
) {
  await requireReview(ctx, actor, input.reviewId);
  const email = v.parse(v.email, input.email);
  const existing = await ctx.db
    .select({ id: reviewRecipients.id, email: reviewRecipients.email })
    .from(reviewRecipients)
    .where(eq(reviewRecipients.reviewId, input.reviewId));
  const match = existing.find((row) => row.email === email);
  if (match) return { id: match.id };
  if (existing.length >= redline.limits.maxRecipientsPerReview) {
    throw new AppError(
      `A review can have up to ${redline.limits.maxRecipientsPerReview} saved addresses.`
    );
  }
  const [row] = await ctx.db
    .insert(reviewRecipients)
    .values({
      reviewId: input.reviewId,
      email,
      addedById: actor.id,
      createdAt: ctx.now()
    })
    .returning({ id: reviewRecipients.id });
  return { id: row!.id };
}

export async function removeRecipient(
  ctx: Ctx,
  actor: Actor,
  input: { reviewId: string; recipientId: string }
) {
  await requireReview(ctx, actor, input.reviewId);
  await ctx.db
    .delete(reviewRecipients)
    .where(
      and(
        eq(reviewRecipients.id, input.recipientId),
        eq(reviewRecipients.reviewId, input.reviewId)
      )
    );
}

async function recordSend(
  ctx: Ctx,
  recipientId: string,
  result: EmailResult
) {
  await ctx.db
    .update(reviewRecipients)
    .set({
      lastStatus: result.sent ? 'sent' : result.code,
      ...(result.sent ? { lastSentAt: ctx.now() } : {})
    })
    .where(eq(reviewRecipients.id, recipientId));
}

/**
 * Sends the review link to one saved address. The browser names a recipient row,
 * never an address, so this can't be pointed at anywhere new.
 */
export async function sendShare(
  ctx: Ctx,
  actor: Actor,
  input: { reviewId: string; recipientId: string }
): Promise<EmailResult> {
  const review = await requireReview(ctx, actor, input.reviewId);
  const link = await linkRow(ctx, input.reviewId);
  if (link.revokedAt) {
    throw new AppError('This link is revoked. Issue a new one before sending it.');
  }
  if (link.expiresAt && link.expiresAt.getTime() <= ctx.now().getTime()) {
    throw new AppError('This link has expired. Change the expiry before sending it.');
  }
  const [recipient] = await ctx.db
    .select({ id: reviewRecipients.id, email: reviewRecipients.email })
    .from(reviewRecipients)
    .where(
      and(
        eq(reviewRecipients.id, input.recipientId),
        eq(reviewRecipients.reviewId, input.reviewId)
      )
    );
  if (!recipient) throw notFound();
  const [workspace] = await ctx.db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, review.workspaceId));
  const result = await sendClientEmail(
    ctx,
    {
      workspaceId: review.workspaceId,
      reviewId: review.id,
      kind: 'share',
      to: recipient.email
    },
    shareEmail({
      workspace: workspace?.name ?? '',
      review: review.name,
      url: `${ctx.appUrl}/r/${link.token}`
    })
  );
  await recordSend(ctx, recipient.id, result);
  return result;
}

/**
 * "Notify clients", clicked after an upload. Goes to the addresses saved on the
 * review, and only once per version so a double click can't send twice.
 */
export async function notifyClients(
  ctx: Ctx,
  actor: Actor,
  input: { versionId: string }
): Promise<{
  results: { email: string; sent: boolean; message: string | null }[];
}> {
  const version = await requireVersion(ctx, actor, input.versionId);
  const review = await requireReview(ctx, actor, version.reviewId);
  if (version.status !== 'ready') {
    throw new AppError('This version is still uploading.');
  }
  const link = await linkRow(ctx, review.id);
  if (link.revokedAt) {
    throw new AppError('This link is revoked. Issue a new one before notifying clients.');
  }
  if (link.expiresAt && link.expiresAt.getTime() <= ctx.now().getTime()) {
    throw new AppError('This link has expired. Change the expiry before notifying clients.');
  }
  const recipients = await ctx.db
    .select({ id: reviewRecipients.id, email: reviewRecipients.email })
    .from(reviewRecipients)
    .where(eq(reviewRecipients.reviewId, review.id));
  if (!recipients.length) {
    throw new AppError(
      'No client addresses are saved on this review yet. Add one in Share first.'
    );
  }
  const claimed = await ctx.db
    .update(versions)
    .set({ notifiedAt: ctx.now() })
    .where(and(eq(versions.id, version.id), isNull(versions.notifiedAt)))
    .returning({ id: versions.id });
  if (!claimed.length) {
    throw new AppError('Clients were already notified about this version.');
  }
  const [asset] = await ctx.db
    .select({ name: assets.name })
    .from(assets)
    .where(eq(assets.id, version.assetId));
  const [workspace] = await ctx.db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, review.workspaceId));

  const results = [];
  for (const recipient of recipients) {
    const result = await sendClientEmail(
      ctx,
      {
        workspaceId: review.workspaceId,
        reviewId: review.id,
        kind: 'new_version',
        to: recipient.email
      },
      newVersionEmail({
        workspace: workspace?.name ?? '',
        review: review.name,
        asset: asset?.name ?? 'a file',
        versionNumber: version.number,
        url: `${ctx.appUrl}/r/${link.token}?a=${version.assetId}`
      })
    );
    await recordSend(ctx, recipient.id, result);
    results.push({
      email: recipient.email,
      sent: result.sent,
      message: result.sent ? null : result.message
    });
  }
  // If nothing went out, let them try again instead of blocking the retry.
  if (!results.some((result) => result.sent)) {
    await ctx.db
      .update(versions)
      .set({ notifiedAt: null })
      .where(eq(versions.id, version.id));
  }
  return { results };
}

