import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  activity,
  assets,
  comments,
  decisions,
  guests,
  pages,
  reports,
  reviewLinks,
  reviews,
  versions,
  workspaces
} from '~/db/schema';
import { redline } from '~/redline.config';
import {
  excerpt,
  nextPin,
  pageExists,
  removeComment,
  versionOfAsset,
  type NewPin
} from './comments';
import type { Ctx } from './context';
import { sha256, signValue, verifyPassword, verifyValue } from './crypto';
import type { DecisionKind, ReviewSnapshot } from './dto';
import { sendToReviewCreator } from './email';
import {
  decisionEmail,
  feedbackEmail,
  firstCommentEmail
} from './email-templates';
import { AppError, notFound, rateLimited } from './errors';
import { claimThrottle, clientKey, consume, releaseThrottle } from './rate-limit';
import { touchReview } from './reviews';
import { buildSnapshot } from './snapshot';
import * as v from './validate';

/** The cookies a guest holds. Routes read and write the real headers. */
export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, maxAgeSeconds: number): void;
};

export type LinkInfo = {
  token: string;
  reviewId: string;
  workspaceId: string;
  workspaceName: string;
  hasPassword: boolean;
  passwordHash: string | null;
  passwordVersion: number;
  allowDownloads: boolean;
};

export type LinkAccess =
  | { state: 'unavailable'; reason: 'unknown' | 'revoked' }
  | { state: 'expired' }
  | { state: 'locked'; workspaceName: string }
  | { state: 'ok'; link: LinkInfo };

const UNLOCK_MAX_AGE = 30 * 24 * 60 * 60;
const GUEST_MAX_AGE = 365 * 24 * 60 * 60;
const UNLOCK_PURPOSE = 'review-unlock';
const GUEST_PURPOSE = 'guest-identity';

const unlockCookieName = async (token: string) =>
  `rl_unlock_${(await sha256(token)).slice(0, 16)}`;
const guestCookieName = (reviewId: string) =>
  `rl_guest_${reviewId.replaceAll('-', '').slice(0, 16)}`;

/**
 * The check behind every guest page, function, and media request. Nothing about a
 * review is returned until this says `ok`.
 */
export async function resolveLink(
  ctx: Ctx,
  token: string,
  cookies: Pick<CookieJar, 'get'>
): Promise<LinkAccess> {
  const parsed = v.token.safeParse(token);
  if (!parsed.success) return { state: 'unavailable', reason: 'unknown' };
  const [row] = await ctx.db
    .select({
      token: reviewLinks.token,
      reviewId: reviewLinks.reviewId,
      passwordHash: reviewLinks.passwordHash,
      passwordVersion: reviewLinks.passwordVersion,
      expiresAt: reviewLinks.expiresAt,
      allowDownloads: reviewLinks.allowDownloads,
      revokedAt: reviewLinks.revokedAt,
      workspaceId: reviews.workspaceId,
      workspaceName: workspaces.name
    })
    .from(reviewLinks)
    .innerJoin(reviews, eq(reviews.id, reviewLinks.reviewId))
    .innerJoin(workspaces, eq(workspaces.id, reviews.workspaceId))
    .where(eq(reviewLinks.token, parsed.data))
    .limit(1);
  if (!row) return { state: 'unavailable', reason: 'unknown' };
  if (row.revokedAt) return { state: 'unavailable', reason: 'revoked' };
  if (row.expiresAt && row.expiresAt.getTime() <= ctx.now().getTime()) {
    return { state: 'expired' };
  }
  if (row.passwordHash) {
    const unlock = await verifyValue<{ t: string; v: number; e: number }>(
      await ctx.secret(),
      UNLOCK_PURPOSE,
      cookies.get(await unlockCookieName(token))
    );
    const valid =
      unlock &&
      unlock.t === row.token &&
      unlock.v === row.passwordVersion &&
      unlock.e > ctx.now().getTime();
    if (!valid) return { state: 'locked', workspaceName: row.workspaceName };
  }
  return {
    state: 'ok',
    link: {
      token: row.token,
      reviewId: row.reviewId,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      hasPassword: Boolean(row.passwordHash),
      passwordHash: row.passwordHash,
      passwordVersion: row.passwordVersion,
      allowDownloads: row.allowDownloads
    }
  };
}

/** For guest functions: anything but a working link is a flat refusal. */
export async function requireLink(
  ctx: Ctx,
  token: string,
  cookies: Pick<CookieJar, 'get'>
): Promise<LinkInfo> {
  const access = await resolveLink(ctx, token, cookies);
  if (access.state !== 'ok') {
    throw new AppError('This review link isn’t available.', 'link_unavailable', 403);
  }
  return access.link;
}

export async function unlockLink(
  ctx: Ctx,
  input: { token: string; password: string; ip: string },
  cookies: CookieJar
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [row] = await ctx.db
    .select({
      token: reviewLinks.token,
      passwordHash: reviewLinks.passwordHash,
      passwordVersion: reviewLinks.passwordVersion,
      revokedAt: reviewLinks.revokedAt,
      expiresAt: reviewLinks.expiresAt
    })
    .from(reviewLinks)
    .where(eq(reviewLinks.token, v.parse(v.token, input.token)))
    .limit(1);
  if (
    !row ||
    !row.passwordHash ||
    row.revokedAt ||
    (row.expiresAt && row.expiresAt.getTime() <= ctx.now().getTime())
  ) {
    return { ok: false, message: 'This review link isn’t available.' };
  }
  const tooMany =
    'Too many tries. Wait 15 minutes, then try again, or ask the team for help.';
  const perClient = await consume(
    ctx,
    `pw:${row.token}:${await clientKey(input.ip)}`,
    redline.rateLimits.passwordTries
  );
  if (!perClient) return { ok: false, message: tooMany };
  const perLink = await consume(
    ctx,
    `pw:${row.token}`,
    redline.rateLimits.passwordTriesPerLink
  );
  if (!perLink) return { ok: false, message: tooMany };
  if (!(await verifyPassword(String(input.password), row.passwordHash))) {
    return { ok: false, message: 'That password isn’t right.' };
  }
  cookies.set(
    await unlockCookieName(row.token),
    await signValue(await ctx.secret(), UNLOCK_PURPOSE, {
      t: row.token,
      v: row.passwordVersion,
      e: ctx.now().getTime() + UNLOCK_MAX_AGE * 1000
    }),
    UNLOCK_MAX_AGE
  );
  return { ok: true };
}

export type GuestLoad =
  | { state: 'unavailable' }
  | { state: 'expired' }
  | { state: 'locked'; workspaceName: string }
  | { state: 'ok'; snapshot: ReviewSnapshot };

/** Who this browser is on this review, from the signed cookie only. */
export async function currentGuest(
  ctx: Ctx,
  link: LinkInfo,
  cookies: Pick<CookieJar, 'get'>
) {
  const signed = await verifyValue<{ g: string; r: string }>(
    await ctx.secret(),
    GUEST_PURPOSE,
    cookies.get(guestCookieName(link.reviewId))
  );
  if (!signed || signed.r !== link.reviewId) return null;
  const [guest] = await ctx.db
    .select({
      id: guests.id,
      name: guests.name,
      email: guests.email,
      lastFeedbackAt: guests.lastFeedbackAt
    })
    .from(guests)
    .where(and(eq(guests.id, signed.g), eq(guests.reviewId, link.reviewId)));
  return guest ?? null;
}

export async function guestLoad(
  ctx: Ctx,
  token: string,
  cookies: Pick<CookieJar, 'get'>
): Promise<GuestLoad> {
  const access = await resolveLink(ctx, token, cookies);
  if (access.state === 'unavailable') return { state: 'unavailable' };
  if (access.state === 'expired') return { state: 'expired' };
  if (access.state === 'locked') {
    return { state: 'locked', workspaceName: access.workspaceName };
  }
  const guest = await currentGuest(ctx, access.link, cookies);
  const snapshot = await buildSnapshot(ctx, access.link.reviewId, {
    kind: 'guest',
    token: access.link.token,
    guestId: guest?.id ?? null,
    guest: guest ? { name: guest.name, email: guest.email } : null
  });
  if (!snapshot) return { state: 'unavailable' };
  return { state: 'ok', snapshot };
}

/**
 * Saves a guest's name and optional email. The email is only stored: nothing here
 * sends to it. It's used when a team member replies to this guest.
 */
export async function guestSetIdentity(
  ctx: Ctx,
  input: { token: string; name: string; email?: string | null; ip: string },
  cookies: CookieJar
) {
  const link = await requireLink(ctx, input.token, cookies);
  await requireRate(
    ctx,
    `guest-id:${link.reviewId}:${await clientKey(input.ip)}`,
    redline.rateLimits.guestIdentity,
    'Too many changes. Try again later.'
  );
  const name = v.parse(v.guestName, input.name);
  const email = input.email?.trim() ? v.parse(v.email, input.email) : null;
  const existing = await currentGuest(ctx, link, cookies);
  if (existing) {
    await ctx.db
      .update(guests)
      .set({ name, email })
      .where(eq(guests.id, existing.id));
    // Earlier comments keep the name they were written under.
    return { name, email };
  }
  const [guest] = await ctx.db
    .insert(guests)
    .values({ reviewId: link.reviewId, name, email, createdAt: ctx.now() })
    .returning({ id: guests.id });
  cookies.set(
    guestCookieName(link.reviewId),
    await signValue(await ctx.secret(), GUEST_PURPOSE, {
      g: guest!.id,
      r: link.reviewId
    }),
    GUEST_MAX_AGE
  );
  return { name, email };
}

async function requireRate(
  ctx: Ctx,
  key: string,
  window: { limit: number; windowMs: number },
  message: string
) {
  if (!(await consume(ctx, key, window))) throw rateLimited(message);
}

async function requireGuest(
  ctx: Ctx,
  link: LinkInfo,
  cookies: Pick<CookieJar, 'get'>
) {
  const guest = await currentGuest(ctx, link, cookies);
  if (!guest) {
    throw new AppError('Add your name first.', 'identity_required', 401);
  }
  return guest;
}

async function limitGuestComments(ctx: Ctx, link: LinkInfo, ip: string) {
  const client = await clientKey(ip);
  const message = 'You’re commenting very quickly. Wait a moment and try again.';
  await requireRate(
    ctx,
    `guest-comment:${link.reviewId}:${client}`,
    redline.rateLimits.guestComments,
    message
  );
  await requireRate(
    ctx,
    `guest-comment-h:${link.reviewId}:${client}`,
    redline.rateLimits.guestCommentsHourly,
    message
  );
}

async function notifyFirstComment(
  ctx: Ctx,
  input: {
    link: LinkInfo;
    guestName: string;
    guestId: string;
    body: string;
    reviewName: string;
  }
) {
  try {
    const count = await ctx.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(comments)
      .where(
        and(
          eq(comments.reviewId, input.link.reviewId),
          eq(comments.guestId, input.guestId)
        )
      );
    if (Number(count[0]?.n ?? 0) !== 1) return;
    const key = `first-comment:${input.link.reviewId}`;
    const claimed = await claimThrottle(
      ctx,
      key,
      redline.email.firstCommentThrottleMs
    );
    if (!claimed) return;
    const result = await sendToReviewCreator(
      ctx,
      {
        workspaceId: input.link.workspaceId,
        reviewId: input.link.reviewId,
        kind: 'first_comment'
      },
      firstCommentEmail({
        guest: input.guestName,
        review: input.reviewName,
        body: excerpt(input.body),
        url: `${ctx.appUrl}/dashboard/reviews/${input.link.reviewId}`
      })
    );
    if (!result.sent) await releaseThrottle(ctx, key);
  } catch (error) {
    console.warn('[email] first comment notification failed', error);
  }
}

async function reviewNameOf(ctx: Ctx, reviewId: string) {
  const [review] = await ctx.db
    .select({ name: reviews.name })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  return review?.name ?? '';
}

export async function guestAddComment(
  ctx: Ctx,
  input: NewPin & { token: string; ip: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  await limitGuestComments(ctx, link, input.ip);
  const version = await versionOfAsset(ctx, input.versionId);
  if (
    !version ||
    version.reviewId !== link.reviewId ||
    version.status !== 'ready' ||
    !(await pageExists(ctx, version.id, input.pageNumber))
  ) {
    throw notFound();
  }
  const body = v.parse(v.commentBody, input.body);
  const id = crypto.randomUUID();
  const now = ctx.now();
  await ctx.db.insert(comments).values({
    id,
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    assetId: version.assetId,
    versionId: version.id,
    pageNumber: input.pageNumber,
    pinNumber: nextPin(version.id, false),
    x: v.parse(v.coordinate, input.x),
    y: v.parse(v.coordinate, input.y),
    body,
    authorKind: 'guest',
    guestId: guest.id,
    authorName: guest.name,
    internal: false,
    createdAt: now
  });
  await ctx.db.insert(activity).values({
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    assetId: version.assetId,
    versionNumber: version.number,
    commentId: id,
    kind: 'guest_comment',
    actorName: guest.name,
    excerpt: excerpt(body),
    createdAt: now
  });
  await touchReview(ctx, link.reviewId);
  await notifyFirstComment(ctx, {
    link,
    guestName: guest.name,
    guestId: guest.id,
    body,
    reviewName: await reviewNameOf(ctx, link.reviewId)
  });
  return { id };
}

/** Guests only ever address comments the guest payload could have shown them. */
async function guestVisibleComment(ctx: Ctx, link: LinkInfo, id: string) {
  const [comment] = await ctx.db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      assetId: comments.assetId,
      versionId: comments.versionId,
      pageNumber: comments.pageNumber,
      guestId: comments.guestId,
      deletedAt: comments.deletedAt
    })
    .from(comments)
    .where(
      and(
        eq(comments.id, v.parse(v.id, id)),
        eq(comments.reviewId, link.reviewId),
        eq(comments.internal, false)
      )
    );
  if (!comment) throw notFound();
  return comment;
}

export async function guestReply(
  ctx: Ctx,
  input: { token: string; parentId: string; body: string; ip: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  await limitGuestComments(ctx, link, input.ip);
  const parent = await guestVisibleComment(ctx, link, input.parentId);
  const rootId = parent.parentId ?? parent.id;
  const body = v.parse(v.commentBody, input.body);
  const id = crypto.randomUUID();
  const now = ctx.now();
  const version = await versionOfAsset(ctx, parent.versionId);
  await ctx.db.insert(comments).values({
    id,
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    assetId: parent.assetId,
    versionId: parent.versionId,
    pageNumber: parent.pageNumber,
    parentId: rootId,
    body,
    authorKind: 'guest',
    guestId: guest.id,
    authorName: guest.name,
    internal: false,
    createdAt: now
  });
  await ctx.db.insert(activity).values({
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    assetId: parent.assetId,
    versionNumber: version?.number ?? null,
    commentId: id,
    kind: 'guest_comment',
    actorName: guest.name,
    excerpt: excerpt(body),
    createdAt: now
  });
  await touchReview(ctx, link.reviewId);
  await notifyFirstComment(ctx, {
    link,
    guestName: guest.name,
    guestId: guest.id,
    body,
    reviewName: await reviewNameOf(ctx, link.reviewId)
  });
  return { id };
}

export async function guestEditComment(
  ctx: Ctx,
  input: { token: string; id: string; body: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  const comment = await guestVisibleComment(ctx, link, input.id);
  if (comment.guestId !== guest.id || comment.deletedAt) {
    throw new AppError('You can only edit your own comments.', 'forbidden', 403);
  }
  const body = v.parse(v.commentBody, input.body);
  await ctx.db
    .update(comments)
    .set({ body, editedAt: ctx.now() })
    .where(eq(comments.id, comment.id));
  await ctx.db
    .update(activity)
    .set({ excerpt: excerpt(body) })
    .where(eq(activity.commentId, comment.id));
}

export async function guestDeleteComment(
  ctx: Ctx,
  input: { token: string; id: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  const comment = await guestVisibleComment(ctx, link, input.id);
  if (comment.guestId !== guest.id) {
    throw new AppError('You can only delete your own comments.', 'forbidden', 403);
  }
  await removeComment(ctx, comment.id);
  await touchReview(ctx, link.reviewId);
}

export async function guestSetResolved(
  ctx: Ctx,
  input: { token: string; id: string; resolved: boolean },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  const comment = await guestVisibleComment(ctx, link, input.id);
  await ctx.db
    .update(comments)
    .set(
      input.resolved
        ? { resolvedAt: ctx.now(), resolvedByName: guest.name }
        : { resolvedAt: null, resolvedByName: null }
    )
    .where(eq(comments.id, comment.parentId ?? comment.id));
  await touchReview(ctx, link.reviewId);
}

/** Approve or request changes on an asset's current version, and only that one. */
export async function guestDecide(
  ctx: Ctx,
  input: {
    token: string;
    assetId: string;
    versionId: string;
    decision: DecisionKind;
    ip: string;
  },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  if (input.decision !== 'approved' && input.decision !== 'changes_requested') {
    throw new AppError('Choose Approve or Request changes.');
  }
  const [asset] = await ctx.db
    .select({
      id: assets.id,
      name: assets.name,
      reviewId: assets.reviewId,
      currentVersionId: assets.currentVersionId
    })
    .from(assets)
    .where(
      and(
        eq(assets.id, v.parse(v.id, input.assetId)),
        eq(assets.reviewId, link.reviewId)
      )
    );
  if (!asset || !asset.currentVersionId) throw notFound();
  if (asset.currentVersionId !== input.versionId) {
    throw new AppError(
      'A newer version has been uploaded. Decisions apply to the current version.',
      'stale_version',
      409
    );
  }
  const version = await versionOfAsset(ctx, asset.currentVersionId);
  if (!version) throw notFound();

  const [latest] = await ctx.db
    .select({ decision: decisions.decision, guestId: decisions.guestId })
    .from(decisions)
    .where(eq(decisions.versionId, version.id))
    .orderBy(sql`${decisions.createdAt} DESC`)
    .limit(1);
  // Saying the same thing again changes nothing and emails nobody.
  if (latest && latest.decision === input.decision) return { unchanged: true };

  await requireRate(
    ctx,
    `guest-decision:${link.reviewId}:${await clientKey(input.ip)}`,
    redline.rateLimits.guestDecisions,
    'Too many decisions in a short time. Try again later.'
  );
  const now = ctx.now();
  const [decision] = await ctx.db
    .insert(decisions)
    .values({
      workspaceId: link.workspaceId,
      reviewId: link.reviewId,
      assetId: asset.id,
      versionId: version.id,
      versionNumber: version.number,
      decision: input.decision,
      guestId: guest.id,
      name: guest.name,
      createdAt: now
    })
    .returning({ id: decisions.id });
  await ctx.db.insert(activity).values({
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    assetId: asset.id,
    versionNumber: version.number,
    kind: 'decision',
    decision: input.decision,
    actorName: guest.name,
    excerpt:
      input.decision === 'approved'
        ? `Approved ${asset.name}, V${version.number}`
        : `Requested changes on ${asset.name}, V${version.number}`,
    createdAt: now
  });
  await touchReview(ctx, link.reviewId);
  await sendToReviewCreator(
    ctx,
    {
      workspaceId: link.workspaceId,
      reviewId: link.reviewId,
      kind: 'decision'
    },
    decisionEmail({
      guest: guest.name,
      review: await reviewNameOf(ctx, link.reviewId),
      asset: asset.name,
      versionNumber: version.number,
      decision: input.decision,
      url: `${ctx.appUrl}/dashboard/reviews/${link.reviewId}?a=${asset.id}`
    })
  );
  return { id: decision!.id, unchanged: false };
}

/** "Send feedback": a summary of this guest's new comments, to the creator. */
export async function guestSendFeedback(
  ctx: Ctx,
  input: { token: string; ip: string },
  cookies: Pick<CookieJar, 'get'>
): Promise<{ sent: boolean; count: number }> {
  const link = await requireLink(ctx, input.token, cookies);
  const guest = await requireGuest(ctx, link, cookies);
  const since = guest.lastFeedbackAt;
  const rows = await ctx.db
    .select({ body: comments.body, pin: comments.pinNumber, asset: assets.name })
    .from(comments)
    .innerJoin(assets, eq(assets.id, comments.assetId))
    .where(
      and(
        eq(comments.reviewId, link.reviewId),
        eq(comments.guestId, guest.id),
        eq(comments.internal, false),
        isNull(comments.deletedAt),
        isNull(comments.sourceCommentId),
        since ? gt(comments.createdAt, since) : undefined
      )
    )
    .orderBy(asc(comments.createdAt));
  if (!rows.length) {
    throw new AppError('You have no new comments to send yet.', 'nothing_to_send');
  }
  await requireRate(
    ctx,
    `guest-feedback:${link.reviewId}:${guest.id}`,
    redline.rateLimits.guestFeedback,
    'Your feedback was already sent. Try again later if you add more.'
  );
  const now = ctx.now();
  await ctx.db
    .update(guests)
    .set({ lastFeedbackAt: now })
    .where(eq(guests.id, guest.id));
  await ctx.db.insert(activity).values({
    workspaceId: link.workspaceId,
    reviewId: link.reviewId,
    kind: 'feedback',
    actorName: guest.name,
    excerpt: `Sent feedback with ${rows.length} ${rows.length === 1 ? 'comment' : 'comments'}`,
    createdAt: now
  });
  await touchReview(ctx, link.reviewId);
  const shown = rows.slice(0, 20);
  const result = await sendToReviewCreator(
    ctx,
    {
      workspaceId: link.workspaceId,
      reviewId: link.reviewId,
      kind: 'feedback'
    },
    feedbackEmail({
      guest: guest.name,
      review: await reviewNameOf(ctx, link.reviewId),
      items: shown.map(
        (row) =>
          `${row.asset}${row.pin ? `, pin ${row.pin}` : ''}: ${excerpt(row.body)}`
      ),
      more: rows.length - shown.length,
      url: `${ctx.appUrl}/dashboard/reviews/${link.reviewId}`
    })
  );
  return { sent: result.sent, count: rows.length };
}

export async function submitReport(
  ctx: Ctx,
  input: { token: string; reason: string; details: string; ip: string }
) {
  const client = await clientKey(input.ip);
  await requireRate(
    ctx,
    `report:${client}`,
    redline.rateLimits.reports,
    'Thanks, we already have your report. Try again later if there’s more.'
  );
  const token = v.parse(v.token, input.token);
  const [link] = await ctx.db
    .select({ reviewId: reviews.id, workspaceId: reviews.workspaceId })
    .from(reviewLinks)
    .innerJoin(reviews, eq(reviews.id, reviewLinks.reviewId))
    .where(eq(reviewLinks.token, token))
    .limit(1);
  await ctx.db.insert(reports).values({
    reviewId: link?.reviewId ?? null,
    workspaceId: link?.workspaceId ?? null,
    token,
    reason: v.parse(v.reportReason, input.reason),
    details: v.parse(v.reportDetails, input.details),
    createdAt: ctx.now()
  });
}

// Media. Each lookup is scoped to the link's review, after the access check.

export async function guestPageObject(
  ctx: Ctx,
  input: { token: string; pageId: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  const [page] = await ctx.db
    .select({ key: pages.previewKey, contentType: pages.contentType })
    .from(pages)
    .innerJoin(versions, eq(versions.id, pages.versionId))
    .where(
      and(
        eq(pages.id, input.pageId),
        eq(versions.reviewId, link.reviewId),
        eq(versions.status, 'ready')
      )
    );
  if (!page) throw notFound();
  return page;
}

export async function guestOriginalObject(
  ctx: Ctx,
  input: { token: string; versionId: string },
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, input.token, cookies);
  if (!link.allowDownloads) {
    throw new AppError('Downloads are turned off for this review.', 'forbidden', 403);
  }
  const [version] = await ctx.db
    .select({
      key: versions.originalKey,
      name: versions.originalName,
      contentType: versions.contentType
    })
    .from(versions)
    .where(
      and(
        eq(versions.id, input.versionId),
        eq(versions.reviewId, link.reviewId),
        eq(versions.status, 'ready')
      )
    );
  if (!version) throw notFound();
  return version;
}

export async function guestLogoKey(
  ctx: Ctx,
  token: string,
  cookies: Pick<CookieJar, 'get'>
) {
  const link = await requireLink(ctx, token, cookies);
  const [workspace] = await ctx.db
    .select({ logoKey: workspaces.logoKey })
    .from(workspaces)
    .where(eq(workspaces.id, link.workspaceId));
  if (!workspace?.logoKey) throw notFound();
  return workspace.logoKey;
}
