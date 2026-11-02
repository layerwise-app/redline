import { beforeEach, describe, expect, it } from 'vitest';
import { teamAddComment, teamReply } from '~/domain/comments';
import {
  guestAddComment,
  guestDecide,
  guestDeleteComment,
  guestEditComment,
  guestLoad,
  guestLogoKey,
  guestOriginalObject,
  guestPageObject,
  guestReply,
  guestSetIdentity,
  guestSetResolved,
  resolveLink,
  unlockLink
} from '~/domain/guest';
import {
  createReview,
  issueNewLink,
  revokeLink,
  teamSnapshot,
  updateLink
} from '~/domain/reviews';
import { setLogo } from '~/domain/workspaces';
import { reviewLinks } from '~/db/schema';
import { eq } from 'drizzle-orm';
import type { Actor } from '~/domain/context';
import { makeHarness, memoryCookies, pngBytes, type Harness } from './helpers/harness';

const INTERNAL_ROOT = 'INTERNAL-ROOT-Margin looks too tight, client will notice';
const INTERNAL_REPLY = 'INTERNAL-REPLY-Budget is nearly spent on this one';

async function setup(h: Harness) {
  const { actor, workspaceId } = await h.signUp('Tess Team');
  const { id: reviewId } = await createReview(h.ctx, actor, { name: 'Homepage', clientName: 'Acme' });
  const uploaded = await h.upload(actor, { reviewId });
  await setLogo(h.ctx, actor, { workspaceId, bytes: pngBytes() });
  const pub = await teamAddComment(h.ctx, actor, { versionId: uploaded.versionId, pageNumber: 1, x: 0.1, y: 0.1, body: 'Client-visible question', internal: false });
  const internal = await teamAddComment(h.ctx, actor, { versionId: uploaded.versionId, pageNumber: 1, x: 0.2, y: 0.2, body: INTERNAL_ROOT, internal: true });
  const reply = await teamReply(h.ctx, actor, { parentId: pub.id, body: INTERNAL_REPLY, internal: true });
  const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, reviewId));
  const team = await teamSnapshot(h.ctx, actor, reviewId);
  const asset = team.assets[0]!;
  return {
    actor,
    reviewId,
    token: link!.token,
    versionId: uploaded.versionId,
    assetId: uploaded.assetId,
    pageId: asset.versions[0]!.pages[0]!.id,
    publicId: pub.id,
    internalId: internal.id,
    internalReplyId: reply.id
  };
}

describe('guests never receive internal comments', () => {
  let h: Harness;
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    h = makeHarness();
    s = await setup(h);
  });

  it('keeps them out of the whole guest payload', async () => {
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    expect(load.state).toBe('ok');
    const json = JSON.stringify(load);
    expect(json).not.toContain(INTERNAL_ROOT);
    expect(json).not.toContain(INTERNAL_REPLY);
    expect(json).not.toContain(s.internalId);
    expect(json).not.toContain(s.internalReplyId);
    expect(json).toContain('Client-visible question');
    if (load.state === 'ok') {
      expect(load.snapshot.comments.every((c) => c.internal === false)).toBe(true);
    }
  });

  it('shows them to the team, marked internal', async () => {
    const team = await teamSnapshot(h.ctx, s.actor, s.reviewId);
    const internal = team.comments.filter((c) => c.internal);
    expect(internal.map((c) => c.body).sort()).toEqual([INTERNAL_ROOT, INTERNAL_REPLY].sort());
  });

  it('leaves no gap in guest pin numbers that would reveal hidden pins', async () => {
    await teamAddComment(h.ctx, s.actor, { versionId: s.versionId, pageNumber: 1, x: 0.3, y: 0.3, body: 'Second public', internal: false });
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    if (load.state !== 'ok') throw new Error('expected ok');
    const pins = load.snapshot.comments.filter((c) => !c.parentId).map((c) => c.pin);
    expect(pins).toEqual([1, 2]);
  });

  it('never exposes team identifiers or guest emails to guests', async () => {
    const other = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', email: 'gia@example.test', ip: '1.1.1.1' }, other);
    await guestAddComment(h.ctx, { token: s.token, versionId: s.versionId, pageNumber: 1, x: 0.4, y: 0.4, body: 'From Gia', internal: false, ip: '1.1.1.1' }, other);
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    const json = JSON.stringify(load);
    expect(json).not.toContain('gia@example.test');
    expect(json).not.toContain(s.actor.email);
    expect(json).not.toContain(s.actor.id);
  });

  it('refuses every guest action aimed at an internal comment', async () => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, cookies);
    const notFound = { code: 'not_found' };
    await expect(guestReply(h.ctx, { token: s.token, parentId: s.internalId, body: 'probe', ip: '1.1.1.1' }, cookies)).rejects.toMatchObject(notFound);
    await expect(guestEditComment(h.ctx, { token: s.token, id: s.internalId, body: 'probe' }, cookies)).rejects.toMatchObject(notFound);
    await expect(guestDeleteComment(h.ctx, { token: s.token, id: s.internalId }, cookies)).rejects.toMatchObject(notFound);
    await expect(guestSetResolved(h.ctx, { token: s.token, id: s.internalId, resolved: true }, cookies)).rejects.toMatchObject(notFound);
  });

  it('ignores a guest asking for their comment to be internal', async () => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, cookies);
    const { id } = await guestAddComment(h.ctx, { token: s.token, versionId: s.versionId, pageNumber: 1, x: 0.5, y: 0.5, body: 'Am I hidden?', internal: true, ip: '1.1.1.1' }, cookies);
    const team = await teamSnapshot(h.ctx, s.actor, s.reviewId);
    expect(team.comments.find((c) => c.id === id)!.internal).toBe(false);
  });

  it('lets guests edit and delete only their own comments', async () => {
    const gia = memoryCookies();
    const ben = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, gia);
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Ben', ip: '1.1.1.2' }, ben);
    const { id } = await guestAddComment(h.ctx, { token: s.token, versionId: s.versionId, pageNumber: 1, x: 0.5, y: 0.5, body: 'Gia wrote this', internal: false, ip: '1.1.1.1' }, gia);
    await expect(guestEditComment(h.ctx, { token: s.token, id, body: 'Ben changed it' }, ben)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(guestDeleteComment(h.ctx, { token: s.token, id }, ben)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(guestEditComment(h.ctx, { token: s.token, id: s.publicId, body: 'nope' }, gia)).rejects.toMatchObject({ code: 'forbidden' });
    await guestEditComment(h.ctx, { token: s.token, id, body: 'Gia edited this' }, gia);
    const seenByBen = await guestLoad(h.ctx, s.token, ben);
    if (seenByBen.state !== 'ok') throw new Error('expected ok');
    const comment = seenByBen.snapshot.comments.find((c) => c.id === id)!;
    expect(comment.body).toBe('Gia edited this');
    expect(comment.canEdit).toBe(false);
    await guestDeleteComment(h.ctx, { token: s.token, id }, gia);
  });
});

describe('a link that isn’t open serves nothing', () => {
  let h: Harness;
  let s: Awaited<ReturnType<typeof setup>>;
  let actor: Actor;
  beforeEach(async () => {
    h = makeHarness();
    s = await setup(h);
    actor = s.actor;
  });

  const mediaRefused = async (cookies = memoryCookies()) => {
    await expect(guestPageObject(h.ctx, { token: s.token, pageId: s.pageId }, cookies)).rejects.toMatchObject({ code: 'link_unavailable' });
    await expect(guestOriginalObject(h.ctx, { token: s.token, versionId: s.versionId }, cookies)).rejects.toMatchObject({ code: 'link_unavailable' });
    await expect(guestLogoKey(h.ctx, s.token, cookies)).rejects.toMatchObject({ code: 'link_unavailable' });
  };

  it('serves media on an open link', async () => {
    await expect(guestPageObject(h.ctx, { token: s.token, pageId: s.pageId }, memoryCookies())).resolves.toHaveProperty('key');
  });

  it('refuses downloads unless the switch is on', async () => {
    await expect(guestOriginalObject(h.ctx, { token: s.token, versionId: s.versionId }, memoryCookies())).rejects.toMatchObject({ code: 'forbidden' });
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, allowDownloads: true });
    await expect(guestOriginalObject(h.ctx, { token: s.token, versionId: s.versionId }, memoryCookies())).resolves.toHaveProperty('key');
  });

  it('locked: serves no media or data until the password is given', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'hunter22' });
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    expect(load.state).toBe('locked');
    const json = JSON.stringify(load);
    expect(json).not.toContain('Homepage');
    expect(json).not.toContain('Client-visible question');
    await mediaRefused();

    const cookies = memoryCookies();
    expect(await unlockLink(h.ctx, { token: s.token, password: 'wrong', ip: '1.1.1.1' }, cookies)).toMatchObject({ ok: false });
    await mediaRefused(cookies);
    expect(await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, cookies)).toEqual({ ok: true });
    await expect(guestPageObject(h.ctx, { token: s.token, pageId: s.pageId }, cookies)).resolves.toHaveProperty('key');
  });

  it('locked: a forged or tampered unlock cookie doesn’t open it', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'hunter22' });
    const good = memoryCookies();
    await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, good);
    const [name, value] = [...good.values.entries()][0]!;
    const forged = memoryCookies();
    forged.values.set(name, `${value.slice(0, -2)}xx`);
    await mediaRefused(forged);
  });

  it('locked: changing the password signs out earlier unlocks', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'hunter22' });
    const cookies = memoryCookies();
    await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, cookies);
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'another22' });
    await mediaRefused(cookies);
  });

  it('allows 5 password tries per 15 minutes', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'hunter22' });
    const cookies = memoryCookies();
    for (let i = 0; i < 5; i++) {
      const result = await unlockLink(h.ctx, { token: s.token, password: 'wrong', ip: '1.1.1.1' }, cookies);
      expect(result).toEqual({ ok: false, message: 'That password isn’t right.' });
    }
    const blocked = await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, cookies);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/Too many tries/);
    h.tick(15 * 60 * 1000 + 1);
    expect(await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, cookies)).toEqual({ ok: true });
  });

  it('revoked: shows nothing and serves no media', async () => {
    await revokeLink(h.ctx, actor, s.reviewId);
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    expect(load).toEqual({ state: 'unavailable' });
    await mediaRefused();
  });

  it('revoked: a guest who already unlocked it is shut out too', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, password: 'hunter22' });
    const cookies = memoryCookies();
    await unlockLink(h.ctx, { token: s.token, password: 'hunter22', ip: '1.1.1.1' }, cookies);
    await revokeLink(h.ctx, actor, s.reviewId);
    await mediaRefused(cookies);
  });

  it('expired: shows nothing and serves no media', async () => {
    await updateLink(h.ctx, actor, { reviewId: s.reviewId, expiresAt: new Date(h.clock.now.getTime() + 1000).toISOString() });
    expect((await guestLoad(h.ctx, s.token, memoryCookies())).state).toBe('ok');
    h.tick(2000);
    const load = await guestLoad(h.ctx, s.token, memoryCookies());
    expect(load).toEqual({ state: 'expired' });
    await mediaRefused();
  });

  it('a new link kills the old token immediately', async () => {
    await issueNewLink(h.ctx, actor, s.reviewId);
    expect((await resolveLink(h.ctx, s.token, memoryCookies())).state).toBe('unavailable');
    await mediaRefused();
  });

  it('refuses every guest write on a dead link', async () => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, cookies);
    await revokeLink(h.ctx, actor, s.reviewId);
    const refused = { code: 'link_unavailable' };
    await expect(guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, cookies)).rejects.toMatchObject(refused);
    await expect(guestAddComment(h.ctx, { token: s.token, versionId: s.versionId, pageNumber: 1, x: 0, y: 0, body: 'x', internal: false, ip: '1.1.1.1' }, cookies)).rejects.toMatchObject(refused);
    await expect(guestDecide(h.ctx, { token: s.token, assetId: s.assetId, versionId: s.versionId, decision: 'approved', ip: '1.1.1.1' }, cookies)).rejects.toMatchObject(refused);
  });

  it('won’t serve one review’s page through another review’s link', async () => {
    const other = await createReview(h.ctx, actor, { name: 'Other', clientName: 'Acme' });
    const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, other.id));
    await expect(guestPageObject(h.ctx, { token: link!.token, pageId: s.pageId }, memoryCookies())).rejects.toMatchObject({ code: 'not_found' });
    await expect(guestOriginalObject(h.ctx, { token: link!.token, versionId: s.versionId }, memoryCookies())).rejects.toBeTruthy();
  });

  it('rate limits guest comments', async () => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name: 'Gia', ip: '1.1.1.1' }, cookies);
    const send = () => guestAddComment(h.ctx, { token: s.token, versionId: s.versionId, pageNumber: 1, x: 0.5, y: 0.5, body: 'hello', internal: false, ip: '1.1.1.1' }, cookies);
    for (let i = 0; i < 12; i++) await send();
    await expect(send()).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
