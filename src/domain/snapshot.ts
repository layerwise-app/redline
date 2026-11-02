import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  assets,
  comments,
  decisions,
  guests,
  pages,
  reviewLinks,
  reviews,
  versions,
  workspaces
} from '~/db/schema';
import type { Ctx } from './context';
import type {
  AssetDTO,
  CommentDTO,
  DecisionDTO,
  GuestIdentity,
  ReviewSnapshot,
  VersionDTO
} from './dto';
import { assetStatus, reviewStatus } from './status';

export type SnapshotViewer =
  | { kind: 'team'; userId: string }
  | {
      kind: 'guest';
      token: string;
      guestId: string | null;
      guest: GuestIdentity | null;
    };

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

/** Media URLs carry the access check: each one is verified on every request. */
const mediaUrls = (viewer: SnapshotViewer) =>
  viewer.kind === 'team'
    ? {
        page: (id: string) => `/api/media/page/${id}`,
        original: (id: string) => `/api/media/original/${id}`,
        logo: (workspaceId: string) => `/api/media/logo/${workspaceId}`
      }
    : {
        page: (id: string) => `/api/guest/${viewer.token}/page/${id}`,
        original: (id: string) => `/api/guest/${viewer.token}/original/${id}`,
        logo: () => `/api/guest/${viewer.token}/logo`
      };

/**
 * One review as this viewer may see it. Guests are limited in the SQL itself
 * (`internal = 0`) and then serialized from a field whitelist, so an internal
 * comment never reaches the HTML or a payload.
 */
export async function buildSnapshot(
  ctx: Ctx,
  reviewId: string,
  viewer: SnapshotViewer
): Promise<ReviewSnapshot | null> {
  const [review] = await ctx.db
    .select({
      id: reviews.id,
      name: reviews.name,
      clientName: reviews.clientName,
      workspaceName: workspaces.name,
      accentColor: workspaces.accentColor,
      logoKey: workspaces.logoKey,
      workspaceId: workspaces.id,
      allowDownloads: reviewLinks.allowDownloads
    })
    .from(reviews)
    .innerJoin(workspaces, eq(workspaces.id, reviews.workspaceId))
    .leftJoin(reviewLinks, eq(reviewLinks.reviewId, reviews.id))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) return null;

  const urls = mediaUrls(viewer);
  const isTeam = viewer.kind === 'team';
  const allowDownloads = Boolean(review.allowDownloads);

  const assetRows = await ctx.db
    .select({
      id: assets.id,
      name: assets.name,
      currentVersionId: assets.currentVersionId,
      createdAt: assets.createdAt
    })
    .from(assets)
    .where(eq(assets.reviewId, reviewId))
    .orderBy(asc(assets.createdAt));

  const versionRows = await ctx.db
    .select({
      id: versions.id,
      assetId: versions.assetId,
      number: versions.number,
      kind: versions.kind,
      originalName: versions.originalName,
      originalSize: versions.originalSize,
      pageCount: versions.pageCount,
      createdAt: versions.createdAt,
      createdByName: versions.createdByName,
      notifiedAt: versions.notifiedAt
    })
    .from(versions)
    .where(and(eq(versions.reviewId, reviewId), eq(versions.status, 'ready')))
    .orderBy(asc(versions.number));

  const versionIds = versionRows.map((v) => v.id);
  const pageRows = versionIds.length
    ? await ctx.db
        .select({
          id: pages.id,
          versionId: pages.versionId,
          number: pages.number,
          width: pages.width,
          height: pages.height
        })
        .from(pages)
        .where(inArray(pages.versionId, versionIds))
        .orderBy(asc(pages.number))
    : [];

  const decisionRows = await ctx.db
    .select({
      id: decisions.id,
      assetId: decisions.assetId,
      versionId: decisions.versionId,
      versionNumber: decisions.versionNumber,
      decision: decisions.decision,
      name: decisions.name,
      createdAt: decisions.createdAt
    })
    .from(decisions)
    .where(eq(decisions.reviewId, reviewId))
    .orderBy(asc(decisions.createdAt));

  const commentRows = await ctx.db
    .select({
      id: comments.id,
      assetId: comments.assetId,
      versionId: comments.versionId,
      pageNumber: comments.pageNumber,
      parentId: comments.parentId,
      pinNumber: comments.pinNumber,
      x: comments.x,
      y: comments.y,
      body: comments.body,
      authorName: comments.authorName,
      authorKind: comments.authorKind,
      authorUserId: comments.authorUserId,
      guestId: comments.guestId,
      guestEmail: guests.email,
      internal: comments.internal,
      resolvedAt: comments.resolvedAt,
      resolvedByName: comments.resolvedByName,
      fromVersionNumber: comments.fromVersionNumber,
      deletedAt: comments.deletedAt,
      editedAt: comments.editedAt,
      createdAt: comments.createdAt
    })
    .from(comments)
    .leftJoin(guests, eq(guests.id, comments.guestId))
    .where(
      isTeam
        ? eq(comments.reviewId, reviewId)
        : and(eq(comments.reviewId, reviewId), eq(comments.internal, false))
    )
    .orderBy(asc(comments.createdAt));

  const versionDtos: Record<string, VersionDTO[]> = {};
  for (const version of versionRows) {
    (versionDtos[version.assetId] ??= []).push({
      id: version.id,
      number: version.number,
      kind: version.kind,
      originalName: version.originalName,
      originalSize: version.originalSize,
      pageCount: version.pageCount,
      createdAt: version.createdAt.toISOString(),
      createdByName: version.createdByName,
      downloadUrl: isTeam || allowDownloads ? urls.original(version.id) : null,
      notifiedAt: isTeam ? iso(version.notifiedAt) : null,
      pages: pageRows
        .filter((page) => page.versionId === version.id)
        .map((page) => ({
          id: page.id,
          number: page.number,
          width: page.width,
          height: page.height,
          url: urls.page(page.id)
        }))
    });
  }

  const assetDtos: AssetDTO[] = assetRows.flatMap((asset) => {
    const list = versionDtos[asset.id];
    if (!asset.currentVersionId || !list?.length) return [];
    const own = decisionRows.filter((d) => d.assetId === asset.id);
    const dtos: DecisionDTO[] = own.map((d) => ({
      id: d.id,
      assetId: d.assetId,
      versionId: d.versionId,
      versionNumber: d.versionNumber,
      decision: d.decision,
      name: d.name,
      createdAt: d.createdAt.toISOString()
    }));
    return [
      {
        id: asset.id,
        name: asset.name,
        status: assetStatus(asset.currentVersionId, own),
        currentVersionId: asset.currentVersionId,
        versions: list,
        decisions: dtos
      }
    ];
  });

  const commentDtos: CommentDTO[] = commentRows.map((row) => {
    const deleted = Boolean(row.deletedAt);
    const mine =
      viewer.kind === 'team'
        ? row.authorUserId === viewer.userId
        : Boolean(viewer.guestId) && row.guestId === viewer.guestId;
    return {
      id: row.id,
      assetId: row.assetId,
      versionId: row.versionId,
      pageNumber: row.pageNumber,
      parentId: row.parentId,
      pin: row.pinNumber,
      x: row.x,
      y: row.y,
      body: deleted ? '' : row.body,
      authorName: deleted ? '' : row.authorName,
      authorKind: row.authorKind,
      internal: isTeam ? row.internal : false,
      resolvedAt: iso(row.resolvedAt),
      resolvedByName: row.resolvedByName,
      fromVersion: row.fromVersionNumber,
      createdAt: row.createdAt.toISOString(),
      editedAt: iso(row.editedAt),
      deleted,
      canEdit: mine && !deleted,
      canDelete: !deleted && (mine || isTeam),
      ...(isTeam && !deleted ? { guestEmail: row.guestEmail } : {})
    };
  });

  return {
    viewer: viewer.kind,
    reviewId: review.id,
    name: review.name,
    clientName: review.clientName,
    status: reviewStatus(assetDtos.map((a) => a.status)),
    brand: {
      name: review.workspaceName,
      accentColor: review.accentColor,
      logoUrl: review.logoKey ? urls.logo(review.workspaceId) : null
    },
    allowDownloads,
    assets: assetDtos,
    comments: commentDtos,
    guest: viewer.kind === 'guest' ? viewer.guest : null
  };
}
