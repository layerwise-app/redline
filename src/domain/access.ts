import { and, desc, eq } from 'drizzle-orm';
import {
  assets,
  comments,
  pages,
  reviews,
  versions,
  workspaceMembers,
  workspaces
} from '~/db/schema';
import { redline } from '~/redline.config';
import type { Actor, Ctx } from './context';
import { notFound, AppError } from './errors';

/**
 * Every team read and write starts here. Each helper joins the row to the
 * actor's membership in one query, so "exists" and "yours" can't drift apart.
 */
const isMember = (actor: Actor, workspaceColumn: typeof workspaces.id | typeof reviews.workspaceId | typeof assets.workspaceId | typeof versions.workspaceId | typeof pages.workspaceId | typeof comments.workspaceId) =>
  and(
    eq(workspaceMembers.workspaceId, workspaceColumn),
    eq(workspaceMembers.userId, actor.id)
  );

export async function requireMember(ctx: Ctx, actor: Actor, workspaceId: string) {
  const [membership] = await ctx.db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      inboxSeenAt: workspaceMembers.inboxSeenAt
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    )
    .limit(1);
  if (!membership) throw notFound();
  return membership;
}

export async function requireOwner(ctx: Ctx, actor: Actor, workspaceId: string) {
  const membership = await requireMember(ctx, actor, workspaceId);
  if (membership.role !== 'owner') {
    throw new AppError('Only the workspace owner can do that.', 'forbidden', 403);
  }
  return membership;
}

export async function requireReview(ctx: Ctx, actor: Actor, reviewId: string) {
  const [review] = await ctx.db
    .select({
      id: reviews.id,
      workspaceId: reviews.workspaceId,
      name: reviews.name,
      clientName: reviews.clientName,
      createdById: reviews.createdById
    })
    .from(reviews)
    .innerJoin(workspaceMembers, isMember(actor, reviews.workspaceId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) throw notFound();
  return review;
}

export async function requireAsset(ctx: Ctx, actor: Actor, assetId: string) {
  const [asset] = await ctx.db
    .select({
      id: assets.id,
      workspaceId: assets.workspaceId,
      reviewId: assets.reviewId,
      name: assets.name,
      currentVersionId: assets.currentVersionId
    })
    .from(assets)
    .innerJoin(workspaceMembers, isMember(actor, assets.workspaceId))
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!asset) throw notFound();
  return asset;
}

export async function requireVersion(ctx: Ctx, actor: Actor, versionId: string) {
  const [version] = await ctx.db
    .select({
      id: versions.id,
      workspaceId: versions.workspaceId,
      reviewId: versions.reviewId,
      assetId: versions.assetId,
      number: versions.number,
      kind: versions.kind,
      status: versions.status,
      originalKey: versions.originalKey,
      originalName: versions.originalName,
      originalSize: versions.originalSize,
      contentType: versions.contentType,
      pageCount: versions.pageCount,
      uploadId: versions.uploadId,
      copyFromVersionId: versions.copyFromVersionId,
      notifiedAt: versions.notifiedAt
    })
    .from(versions)
    .innerJoin(workspaceMembers, isMember(actor, versions.workspaceId))
    .where(eq(versions.id, versionId))
    .limit(1);
  if (!version) throw notFound();
  return version;
}

export async function requirePage(ctx: Ctx, actor: Actor, pageId: string) {
  const [page] = await ctx.db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      previewKey: pages.previewKey,
      contentType: pages.contentType
    })
    .from(pages)
    .innerJoin(workspaceMembers, isMember(actor, pages.workspaceId))
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw notFound();
  return page;
}

export async function requireComment(ctx: Ctx, actor: Actor, commentId: string) {
  const [comment] = await ctx.db
    .select({
      id: comments.id,
      workspaceId: comments.workspaceId,
      reviewId: comments.reviewId,
      assetId: comments.assetId,
      versionId: comments.versionId,
      pageNumber: comments.pageNumber,
      parentId: comments.parentId,
      internal: comments.internal,
      authorUserId: comments.authorUserId,
      body: comments.body,
      deletedAt: comments.deletedAt
    })
    .from(comments)
    .innerJoin(workspaceMembers, isMember(actor, comments.workspaceId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!comment) throw notFound();
  return comment;
}

/** A workspace named after its person. Every new account gets one. */
export async function createWorkspaceFor(
  ctx: Ctx,
  person: { id: string; name: string }
) {
  const first = person.name.trim().split(/\s+/)[0] || 'My';
  const now = ctx.now();
  const id = crypto.randomUUID();
  await ctx.db.batch([
    ctx.db.insert(workspaces).values({
      id,
      name: `${first}’s workspace`.slice(0, redline.limits.workspaceNameMaxLength),
      accentColor: redline.colors.accent,
      createdAt: now
    }),
    ctx.db.insert(workspaceMembers).values({
      workspaceId: id,
      userId: person.id,
      role: 'owner',
      lastActiveAt: now,
      createdAt: now
    })
  ]);
  return id;
}

/**
 * The workspace this person is working in: their most recently used one. Sign-up
 * creates the first; this also covers someone who has just left or deleted their
 * last workspace.
 */
export async function activeWorkspaceId(ctx: Ctx, actor: Actor): Promise<string> {
  const [membership] = await ctx.db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, actor.id))
    .orderBy(desc(workspaceMembers.lastActiveAt))
    .limit(1);
  return membership?.workspaceId ?? createWorkspaceFor(ctx, actor);
}
