import { and, asc, eq, lt, max, ne, sql } from 'drizzle-orm';
import { assets, comments, pages, versions } from '~/db/schema';
import { redline } from '~/redline.config';
import { getStorageErrorCode } from '~/lib/storage';
import { requireAsset, requireReview, requireVersion } from './access';
import type { Actor, Ctx } from './context';
import { AppError } from './errors';
import {
  checkUpload,
  contentMatches,
  declaredPdfPageCount,
  isAcceptedContentType,
  parseImageSize,
  REJECTED_TYPE_MESSAGE,
  sniffFileType,
  SVG_MESSAGE
} from './files';
import {
  deleteKeys,
  storageErrorMessage,
  workspaceUsedBytes
} from './workspaces';
import { touchReview } from './reviews';
import * as v from './validate';

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export async function getUploadLimits(ctx: Ctx, actor: Actor, reviewId: string) {
  const review = await requireReview(ctx, actor, reviewId);
  const usage = await ctx.storage.usage();
  return {
    usedBytes: await workspaceUsedBytes(ctx, review.workspaceId),
    limitBytes: redline.limits.workspaceStorageBytes,
    maxFileBytes: Math.min(redline.limits.maxFileBytes, usage.maxFileBytes),
    readOnly: usage.readOnly
  };
}

/** Uploads abandoned for a day stop holding their reservation. */
async function clearStaleUploads(ctx: Ctx, workspaceId: string) {
  const cutoff = new Date(ctx.now().getTime() - STALE_UPLOAD_MS);
  const stale = await ctx.db
    .select({ id: versions.id })
    .from(versions)
    .where(
      and(
        eq(versions.workspaceId, workspaceId),
        ne(versions.status, 'ready'),
        lt(versions.createdAt, cutoff)
      )
    );
  for (const { id } of stale) await destroyPendingVersion(ctx, id);
}

async function destroyPendingVersion(ctx: Ctx, versionId: string) {
  const [version] = await ctx.db
    .select({
      assetId: versions.assetId,
      originalKey: versions.originalKey,
      status: versions.status
    })
    .from(versions)
    .where(eq(versions.id, versionId));
  if (!version || version.status === 'ready') return;
  const previews = await ctx.db
    .select({ key: pages.previewKey })
    .from(pages)
    .where(eq(pages.versionId, versionId));
  await deleteKeys(ctx, [version.originalKey, ...previews.map((p) => p.key)]);
  await ctx.db.delete(versions).where(eq(versions.id, versionId));
  const [remaining] = await ctx.db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.assetId, version.assetId))
    .limit(1);
  if (!remaining) {
    await ctx.db.delete(assets).where(eq(assets.id, version.assetId));
  }
}

export type BeginUpload = {
  reviewId: string;
  /** Null starts a new asset; an id uploads a new version of that asset. */
  assetId: string | null;
  fileName: string;
  size: number;
  contentType: string;
  pageCount: number;
  copyOpenComments: boolean;
};

/**
 * Checks limits, reserves the bytes, and returns a direct upload to Storage.
 * The bytes themselves get checked in `finishOriginal`.
 */
export async function beginUpload(ctx: Ctx, actor: Actor, input: BeginUpload) {
  const review = await requireReview(ctx, actor, input.reviewId);
  const asset = input.assetId ? await requireAsset(ctx, actor, input.assetId) : null;
  if (asset && asset.reviewId !== review.id) throw new AppError('Not found.', 'not_found', 404);

  const contentType = input.contentType.toLowerCase();
  if (contentType === 'image/svg+xml' || /\.svgz?$/i.test(input.fileName)) {
    throw new AppError(SVG_MESSAGE, 'rejected_type', 415);
  }
  if (!isAcceptedContentType(contentType)) {
    throw new AppError(REJECTED_TYPE_MESSAGE, 'rejected_type', 415);
  }
  const kind = contentType === 'application/pdf' ? 'pdf' : 'image';
  const pageCount = Math.floor(input.pageCount);
  if (kind === 'image' && pageCount !== 1) {
    throw new AppError('An image has exactly one page.');
  }
  if (kind === 'pdf' && pageCount > redline.limits.maxPdfPages) {
    throw new AppError(
      `This PDF has ${pageCount} pages. The limit is ${redline.limits.maxPdfPages}.`,
      'too_many_pages',
      413
    );
  }
  if (pageCount < 1) throw new AppError('This file has no pages to review.');
  const size = Math.floor(input.size);
  if (!Number.isFinite(size) || size <= 0) throw new AppError('This file is empty.');

  await clearStaleUploads(ctx, review.workspaceId);
  const usage = await ctx.storage.usage();
  const refusal = checkUpload({
    size,
    usedBytes: await workspaceUsedBytes(ctx, review.workspaceId),
    usage
  });
  if (refusal) throw new AppError(refusal.message, refusal.code, 413);

  const now = ctx.now();
  const fileName = v.parse(v.assetName, input.fileName);
  const assetId = asset?.id ?? crypto.randomUUID();
  if (!asset) {
    await ctx.db.insert(assets).values({
      id: assetId,
      workspaceId: review.workspaceId,
      reviewId: review.id,
      name: fileName.replace(/\.[a-z0-9]+$/i, '') || fileName,
      createdAt: now
    });
  }
  const [{ top } = { top: 0 }] = await ctx.db
    .select({ top: max(versions.number) })
    .from(versions)
    .where(eq(versions.assetId, assetId));
  const versionId = crypto.randomUUID();
  const key = `workspaces/${review.workspaceId}/reviews/${review.id}/assets/${assetId}/${versionId}/original`;

  await ctx.db.insert(versions).values({
    id: versionId,
    workspaceId: review.workspaceId,
    reviewId: review.id,
    assetId,
    number: (top ?? 0) + 1,
    kind,
    originalKey: key,
    originalName: fileName,
    originalSize: size,
    contentType,
    pageCount,
    status: 'uploading',
    copyFromVersionId:
      asset && input.copyOpenComments ? asset.currentVersionId : null,
    createdById: actor.id,
    createdByName: actor.name,
    createdAt: now
  });

  try {
    const upload = await ctx.storage.createUpload({
      key,
      size,
      contentType,
      customMetadata: { name: fileName }
    });
    await ctx.db
      .update(versions)
      .set({ uploadId: upload.id })
      .where(eq(versions.id, versionId));
    return {
      versionId,
      assetId,
      upload: { url: upload.url, headers: upload.headers }
    };
  } catch (error) {
    await destroyPendingVersion(ctx, versionId);
    throw storageErrorMessage(error) ?? error;
  }
}

/** The original is in Storage. Now its real bytes decide whether it stays. */
export async function finishOriginal(
  ctx: Ctx,
  actor: Actor,
  input: { versionId: string }
) {
  const version = await requireVersion(ctx, actor, input.versionId);
  if (version.status !== 'uploading' || !version.uploadId) {
    throw new AppError('This upload has already finished.');
  }
  const refuse = async (message: string, code: string, status: number) => {
    await destroyPendingVersion(ctx, version.id);
    return new AppError(message, code, status);
  };

  let stored;
  try {
    stored = await ctx.storage.completeUpload(version.uploadId);
  } catch (error) {
    const friendly = storageErrorMessage(error);
    if (friendly) throw await refuse(friendly.message, friendly.code, friendly.status);
    if (getStorageErrorCode(error) === 'UploadIncomplete') {
      throw new AppError('The upload didn’t finish. Try again.');
    }
    throw error;
  }
  if (stored.size > redline.limits.maxFileBytes || stored.size !== version.originalSize) {
    throw await refuse('This file’s size doesn’t match what was declared.', 'size_mismatch', 400);
  }

  const head = await readRange(ctx, version.originalKey, { offset: 0, length: 65_536 });
  const sniffed = sniffFileType(head);
  if (sniffed === 'svg') throw await refuse(SVG_MESSAGE, 'rejected_type', 415);
  if (
    !isAcceptedContentType(version.contentType) ||
    !contentMatches(version.contentType, sniffed)
  ) {
    throw await refuse(
      `This file’s contents don’t match its type. ${REJECTED_TYPE_MESSAGE}`,
      'rejected_type',
      415
    );
  }
  if (sniffed === 'pdf') {
    const tail = await readRange(ctx, version.originalKey, { suffix: 262_144 });
    const declared = Math.max(declaredPdfPageCount(head), declaredPdfPageCount(tail));
    if (declared > redline.limits.maxPdfPages) {
      throw await refuse(
        `This PDF has ${declared} pages. The limit is ${redline.limits.maxPdfPages}.`,
        'too_many_pages',
        413
      );
    }
  }
  await ctx.db
    .update(versions)
    .set({ status: 'processing', uploadId: null })
    .where(eq(versions.id, version.id));
}

async function readRange(
  ctx: Ctx,
  key: string,
  range: { offset: number; length: number } | { suffix: number }
) {
  const object = await ctx.storage.get(key, { range });
  if (!object) throw new AppError('The uploaded file is missing. Try again.');
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

/** One rendered page preview. Size is read from the file, not trusted. */
export async function addPreview(
  ctx: Ctx,
  actor: Actor,
  input: { versionId: string; pageNumber: number; bytes: Uint8Array }
) {
  const version = await requireVersion(ctx, actor, input.versionId);
  if (version.status !== 'processing') {
    throw new AppError('This version isn’t accepting previews.');
  }
  const pageNumber = Math.floor(input.pageNumber);
  if (pageNumber < 1 || pageNumber > version.pageCount) {
    throw new AppError('That page isn’t part of this file.');
  }
  if (input.bytes.byteLength > redline.limits.previewMaxBytes) {
    throw new AppError('This page’s preview is too large.', 'FileTooLarge', 413);
  }
  const type = sniffFileType(input.bytes);
  // WebP everywhere it can be encoded; Safari's canvas falls back to JPEG.
  if (type !== 'webp' && type !== 'jpeg') {
    throw new AppError('Previews must be WebP or JPEG.', 'rejected_type', 415);
  }
  const size = parseImageSize(input.bytes);
  if (!size || size.width < 1 || size.height < 1) {
    throw new AppError('This page’s preview can’t be read.');
  }
  if (size.width > redline.limits.previewMaxWidth) {
    throw new AppError(
      `Previews can be up to ${redline.limits.previewMaxWidth} px wide.`
    );
  }
  const usage = await ctx.storage.usage();
  const refusal = checkUpload({
    size: input.bytes.byteLength,
    usedBytes: await workspaceUsedBytes(ctx, version.workspaceId),
    usage
  });
  if (refusal) throw new AppError(refusal.message, refusal.code, 413);

  const key = `${version.originalKey.replace(/\/original$/, '')}/page-${pageNumber}`;
  const contentType = type === 'webp' ? 'image/webp' : 'image/jpeg';
  try {
    await ctx.storage.put(key, input.bytes, { contentType });
  } catch (error) {
    throw storageErrorMessage(error) ?? error;
  }
  await ctx.db
    .insert(pages)
    .values({
      workspaceId: version.workspaceId,
      versionId: version.id,
      number: pageNumber,
      previewKey: key,
      previewSize: input.bytes.byteLength,
      contentType,
      width: size.width,
      height: size.height
    })
    .onConflictDoUpdate({
      target: [pages.versionId, pages.number],
      set: {
        previewSize: input.bytes.byteLength,
        contentType,
        width: size.width,
        height: size.height
      }
    });
}

/**
 * All pages are in: this version becomes current, which resets the asset to In
 * review (only decisions on the current version count), and open comments copy
 * forward if that was asked for.
 */
export async function finalizeVersion(
  ctx: Ctx,
  actor: Actor,
  input: { versionId: string }
) {
  const version = await requireVersion(ctx, actor, input.versionId);
  if (version.status !== 'processing') {
    throw new AppError('This version isn’t ready to finish.');
  }
  const [{ count } = { count: 0 }] = await ctx.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(pages)
    .where(eq(pages.versionId, version.id));
  if (Number(count) !== version.pageCount) {
    throw new AppError('Some pages haven’t finished processing.');
  }
  await ctx.db
    .update(versions)
    .set({ status: 'ready' })
    .where(eq(versions.id, version.id));
  if (version.copyFromVersionId) {
    await copyOpenComments(ctx, {
      fromVersionId: version.copyFromVersionId,
      toVersionId: version.id,
      toPageCount: version.pageCount
    });
  }
  await ctx.db
    .update(assets)
    .set({ currentVersionId: version.id })
    .where(eq(assets.id, version.assetId));
  await touchReview(ctx, version.reviewId);
  return { versionId: version.id, number: version.number };
}

/**
 * Copies threads whose pin is still open: not resolved, not deleted. Replies come
 * along so the conversation isn't lost; resolved threads stay behind on their
 * version. Internal stays internal, and pages past the new version's end land on
 * its last page.
 */
export async function copyOpenComments(
  ctx: Ctx,
  input: { fromVersionId: string; toVersionId: string; toPageCount: number }
) {
  const [source] = await ctx.db
    .select({ number: versions.number })
    .from(versions)
    .where(eq(versions.id, input.fromVersionId));
  if (!source) return 0;
  const rows = await ctx.db
    .select()
    .from(comments)
    .where(eq(comments.versionId, input.fromVersionId))
    .orderBy(asc(comments.createdAt));
  const roots = rows.filter(
    (row) => !row.parentId && !row.resolvedAt && !row.deletedAt
  );
  if (!roots.length) return 0;

  const counters = { public: 0, internal: 0 };
  const inserts: (typeof comments.$inferInsert)[] = [];
  for (const root of [...roots].sort(
    (a, b) => (a.pinNumber ?? 0) - (b.pinNumber ?? 0)
  )) {
    const newRootId = crypto.randomUUID();
    const pageNumber = Math.min(root.pageNumber, input.toPageCount);
    const scope = root.internal ? 'internal' : 'public';
    counters[scope] += 1;
    const base = (row: typeof root) => ({
      workspaceId: row.workspaceId,
      reviewId: row.reviewId,
      assetId: row.assetId,
      versionId: input.toVersionId,
      pageNumber,
      body: row.body,
      authorKind: row.authorKind,
      authorUserId: row.authorUserId,
      guestId: row.guestId,
      authorName: row.authorName,
      internal: row.internal,
      fromVersionNumber: row.fromVersionNumber ?? source.number,
      sourceCommentId: row.id,
      editedAt: row.editedAt,
      createdAt: row.createdAt
    });
    inserts.push({
      ...base(root),
      id: newRootId,
      pinNumber: counters[scope],
      x: root.x,
      y: root.y
    });
    for (const reply of rows) {
      if (reply.parentId === root.id && !reply.deletedAt) {
        inserts.push({ ...base(reply), parentId: newRootId });
      }
    }
  }
  // D1 caps bound parameters per statement, so insert in small groups.
  const statements = [];
  for (let i = 0; i < inserts.length; i += 4) {
    statements.push(ctx.db.insert(comments).values(inserts.slice(i, i + 4)));
  }
  await ctx.db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  return roots.length;
}

export async function abortUpload(
  ctx: Ctx,
  actor: Actor,
  input: { versionId: string }
) {
  const version = await requireVersion(ctx, actor, input.versionId);
  await destroyPendingVersion(ctx, version.id);
}

