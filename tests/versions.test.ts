import { beforeEach, describe, expect, it } from 'vitest';
import { teamAddComment, teamDeleteComment, teamReply, teamSetResolved } from '~/domain/comments';
import { guestAddComment, guestDecide, guestLoad, guestSetIdentity } from '~/domain/guest';
import { createReview, listReviews, teamSnapshot } from '~/domain/reviews';
import { reviewLinks } from '~/db/schema';
import { assetStatus, reviewStatus } from '~/domain/status';
import { eq } from 'drizzle-orm';
import { makeHarness, memoryCookies, type Harness } from './helpers/harness';

async function setup(h: Harness) {
  const { actor } = await h.signUp('Tess Team');
  const { id: reviewId } = await createReview(h.ctx, actor, { name: 'Homepage', clientName: 'Acme' });
  const v1 = await h.upload(actor, { reviewId });
  const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, reviewId));
  const cookies = memoryCookies();
  await guestSetIdentity(h.ctx, { token: link!.token, name: 'Gia Client', ip: '1.1.1.1' }, cookies);
  return { actor, reviewId, v1, token: link!.token, cookies };
}

describe('a new version', () => {
  let h: Harness;
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    h = makeHarness();
    s = await setup(h);
  });

  const decide = (assetId: string, versionId: string, decision: 'approved' | 'changes_requested') =>
    guestDecide(h.ctx, { token: s.token, assetId, versionId, decision, ip: '1.1.1.1' }, s.cookies);
  const snapshot = () => teamSnapshot(h.ctx, s.actor, s.reviewId);

  it('resets approval to In review and keeps the earlier decision in history', async () => {
    await decide(s.v1.assetId, s.v1.versionId, 'approved');
    h.tick();
    let review = await snapshot();
    expect(review.assets[0]!.status).toBe('approved');
    expect(review.status).toBe('approved');

    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId });
    review = await snapshot();
    const asset = review.assets[0]!;
    expect(asset.currentVersionId).toBe(v2.versionId);
    expect(asset.status).toBe('in_review');
    expect(review.status).toBe('in_review');
    expect(asset.decisions).toHaveLength(1);
    expect(asset.decisions[0]).toMatchObject({
      decision: 'approved',
      name: 'Gia Client',
      versionNumber: 1
    });
    expect(asset.decisions[0]!.createdAt).toBeTruthy();
  });

  it('records the name, time, and version number of each decision', async () => {
    await decide(s.v1.assetId, s.v1.versionId, 'changes_requested');
    h.tick();
    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId });
    await decide(s.v1.assetId, v2.versionId, 'approved');
    const asset = (await snapshot()).assets[0]!;
    expect(asset.status).toBe('approved');
    expect(asset.decisions.map((d) => [d.decision, d.versionNumber, d.name])).toEqual([
      ['changes_requested', 1, 'Gia Client'],
      ['approved', 2, 'Gia Client']
    ]);
  });

  it('rejects a decision on anything but the current version', async () => {
    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId });
    await expect(decide(s.v1.assetId, s.v1.versionId, 'approved')).rejects.toMatchObject({ code: 'stale_version' });
    expect((await snapshot()).assets[0]!.decisions).toHaveLength(0);
    await decide(s.v1.assetId, v2.versionId, 'approved');
    expect((await snapshot()).assets[0]!.status).toBe('approved');
  });

  it('copies only open comments forward, labeled with their version', async () => {
    const add = (body: string, internal = false) =>
      teamAddComment(h.ctx, s.actor, { versionId: s.v1.versionId, pageNumber: 1, x: 0.25, y: 0.75, body, internal });
    const open = await add('Open comment');
    const resolved = await add('Resolved comment');
    const deleted = await add('Deleted comment');
    const internalOpen = await add('Open internal comment', true);
    const reply = await teamReply(h.ctx, s.actor, { parentId: open.id, body: 'A reply on the open one', internal: false });
    await teamSetResolved(h.ctx, s.actor, { id: resolved.id, resolved: true });
    await teamDeleteComment(h.ctx, s.actor, deleted.id);
    const guestComment = await guestAddComment(h.ctx, { token: s.token, versionId: s.v1.versionId, pageNumber: 1, x: 0.6, y: 0.6, body: 'Open guest comment', internal: false, ip: '1.1.1.1' }, s.cookies);

    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId, copyOpenComments: true });
    const review = await snapshot();
    const copied = review.comments.filter((c) => c.versionId === v2.versionId);
    const bodies = copied.map((c) => c.body).sort();
    expect(bodies).toEqual(['A reply on the open one', 'Open comment', 'Open guest comment', 'Open internal comment'].sort());
    expect(copied.every((c) => c.fromVersion === 1)).toBe(true);
    expect(copied.every((c) => c.resolvedAt === null)).toBe(true);

    // Same spot, new ids, thread intact, internal still internal.
    const root = copied.find((c) => c.body === 'Open comment')!;
    expect(root.id).not.toBe(open.id);
    expect([root.x, root.y]).toEqual([0.25, 0.75]);
    expect(copied.find((c) => c.body === 'A reply on the open one')!.parentId).toBe(root.id);
    expect(copied.find((c) => c.body === 'Open internal comment')!.internal).toBe(true);
    expect(internalOpen.id).toBeTruthy();
    expect(reply.id).toBeTruthy();

    // Comments stay with their version: V1 still has all of its own.
    const originals = review.comments.filter((c) => c.versionId === s.v1.versionId);
    expect(originals.map((c) => c.id)).toEqual(expect.arrayContaining([open.id, resolved.id, guestComment.id]));
    expect(originals.find((c) => c.id === resolved.id)!.resolvedAt).not.toBeNull();
    expect(originals.every((c) => c.fromVersion === null)).toBe(true);

    // Client view: the copy shows, its internal sibling doesn't.
    const guest = await guestLoad(h.ctx, s.token, s.cookies);
    if (guest.state !== 'ok') throw new Error('expected ok');
    const guestBodies = guest.snapshot.comments.filter((c) => c.versionId === v2.versionId).map((c) => c.body);
    expect(guestBodies).not.toContain('Open internal comment');
    expect(guestBodies).toContain('Open comment');
    expect(guest.snapshot.comments.find((c) => c.body === 'Open guest comment' && c.versionId === v2.versionId)?.canEdit).toBe(true);
  });

  it('copies nothing unless asked, and comments stay with their version', async () => {
    await teamAddComment(h.ctx, s.actor, { versionId: s.v1.versionId, pageNumber: 1, x: 0.5, y: 0.5, body: 'Open', internal: false });
    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId, copyOpenComments: false });
    const review = await snapshot();
    expect(review.comments.filter((c) => c.versionId === v2.versionId)).toEqual([]);
    expect(review.comments.filter((c) => c.versionId === s.v1.versionId)).toHaveLength(1);
  });

  it('puts a comment from a removed page on the last page', async () => {
    const pdf = await h.upload(s.actor, { reviewId: s.reviewId, pages: 4 });
    await teamAddComment(h.ctx, s.actor, { versionId: pdf.versionId, pageNumber: 4, x: 0.5, y: 0.5, body: 'On page four', internal: false });
    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: pdf.assetId, pages: 2, copyOpenComments: true });
    const copied = (await snapshot()).comments.find((c) => c.versionId === v2.versionId)!;
    expect(copied.pageNumber).toBe(2);
  });

  it('marks a review Approved only when all of its assets are', async () => {
    const second = await h.upload(s.actor, { reviewId: s.reviewId, fileName: 'label.png' });
    await decide(s.v1.assetId, s.v1.versionId, 'approved');
    expect((await snapshot()).status).toBe('in_review');
    expect((await listReviews(h.ctx, s.actor))[0]!.status).toBe('in_review');
    await decide(second.assetId, second.versionId, 'changes_requested');
    expect((await snapshot()).status).toBe('changes_requested');
    h.tick();
    await decide(second.assetId, second.versionId, 'approved');
    expect((await snapshot()).status).toBe('approved');
    expect((await listReviews(h.ctx, s.actor))[0]!.status).toBe('approved');

    // A new version of one asset pulls the whole review back.
    await h.upload(s.actor, { reviewId: s.reviewId, assetId: second.assetId });
    expect((await snapshot()).status).toBe('in_review');
  });

  it('never presents a decision as verified', async () => {
    await decide(s.v1.assetId, s.v1.versionId, 'approved');
    const json = JSON.stringify((await snapshot()).assets[0]!.decisions);
    expect(json).not.toMatch(/verified/i);
  });
});

describe('status rules', () => {
  const d = (versionId: string, decision: 'approved' | 'changes_requested', createdAt: number) => ({ versionId, decision, createdAt });

  it('takes the latest decision on the current version only', () => {
    expect(assetStatus('v2', [])).toBe('in_review');
    expect(assetStatus('v2', [d('v1', 'approved', 1)])).toBe('in_review');
    expect(assetStatus('v2', [d('v2', 'approved', 1), d('v2', 'changes_requested', 2)])).toBe('changes_requested');
    expect(assetStatus('v2', [d('v2', 'changes_requested', 1), d('v2', 'approved', 2)])).toBe('approved');
  });

  it('derives review status from all assets', () => {
    expect(reviewStatus([])).toBe('empty');
    expect(reviewStatus(['approved', 'approved'])).toBe('approved');
    expect(reviewStatus(['approved', 'in_review'])).toBe('in_review');
    expect(reviewStatus(['approved', 'changes_requested'])).toBe('changes_requested');
  });
});
