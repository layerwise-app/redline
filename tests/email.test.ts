import { beforeEach, describe, expect, it } from 'vitest';
import { teamAddComment, teamReply } from '~/domain/comments';
import { guestAddComment, guestDecide, guestReply, guestSendFeedback, guestSetIdentity } from '~/domain/guest';
import { addRecipient, createReview, getShareState, notifyClients, sendShare } from '~/domain/reviews';
import { reviewLinks } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { redline } from '~/redline.config';
import { makeHarness, memoryCookies, type Harness } from './helpers/harness';

const HOUR = 60 * 60 * 1000;

async function setup(h: Harness) {
  const { actor } = await h.signUp('Tess Team');
  const { id: reviewId } = await createReview(h.ctx, actor, { name: 'Homepage', clientName: 'Acme' });
  const v1 = await h.upload(actor, { reviewId });
  const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, reviewId));
  return { actor, reviewId, v1, token: link!.token };
}

describe('email', () => {
  let h: Harness;
  let s: Awaited<ReturnType<typeof setup>>;
  const typed = 'typed-by-guest@example.test';
  const guest = async (name = 'Gia', email: string | null = typed, ip = '1.1.1.1') => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: s.token, name, email, ip }, cookies);
    return cookies;
  };
  const guestPin = (cookies: ReturnType<typeof memoryCookies>, ip = '1.1.1.1') =>
    guestAddComment(h.ctx, { token: s.token, versionId: s.v1.versionId, pageNumber: 1, x: 0.5, y: 0.5, body: 'A guest comment', internal: false, ip }, cookies);

  beforeEach(async () => {
    h = makeHarness();
    s = await setup(h);
  });

  it('never emails a guest-typed address from a guest’s own requests', async () => {
    const cookies = await guest();
    const { id } = await guestPin(cookies);
    await guestReply(h.ctx, { token: s.token, parentId: id, body: 'Follow up', ip: '1.1.1.1' }, cookies);
    await guestDecide(h.ctx, { token: s.token, assetId: s.v1.assetId, versionId: s.v1.versionId, decision: 'approved', ip: '1.1.1.1' }, cookies);
    await guestSendFeedback(h.ctx, { token: s.token, ip: '1.1.1.1' }, cookies);
    expect(h.email.sent.length).toBeGreaterThan(0);
    expect(h.email.to(typed)).toEqual([]);
    // Everything went to the review's creator, from our records.
    expect(new Set(h.email.sent.map((m) => m.to))).toEqual(new Set([s.actor.email]));
  });

  it('emails the guest on a team reply, at most once per review per hour', async () => {
    const cookies = await guest();
    const { id } = await guestPin(cookies);
    h.email.sent = [];
    await teamReply(h.ctx, s.actor, { parentId: id, body: 'First reply', internal: false });
    await teamReply(h.ctx, s.actor, { parentId: id, body: 'Second reply', internal: false });
    expect(h.email.to(typed)).toHaveLength(1);
    expect(h.email.to(typed)[0]!.text).toContain('First reply');
    h.tick(HOUR + 1);
    await teamReply(h.ctx, s.actor, { parentId: id, body: 'Third reply', internal: false });
    expect(h.email.to(typed)).toHaveLength(2);
  });

  it('never emails a guest about an internal reply', async () => {
    const cookies = await guest();
    const { id } = await guestPin(cookies);
    h.email.sent = [];
    await teamReply(h.ctx, s.actor, { parentId: id, body: 'Team only', internal: true });
    expect(h.email.sent).toEqual([]);
  });

  it('forces replies in internal threads to stay internal, and quiet', async () => {
    const internal = await teamAddComment(h.ctx, s.actor, { versionId: s.v1.versionId, pageNumber: 1, x: 0.1, y: 0.1, body: 'Internal', internal: true });
    h.email.sent = [];
    await teamReply(h.ctx, s.actor, { parentId: internal.id, body: 'Reply', internal: false });
    expect(h.email.sent).toEqual([]);
  });

  it('emails the creator once per review per hour when guests first comment', async () => {
    await guestPin(await guest('Gia'));
    await guestPin(await guest('Ben', null, '2.2.2.2'), '2.2.2.2');
    const first = h.email.sent.filter((m) => m.subject.includes('commented on'));
    expect(first).toHaveLength(1);
    h.tick(HOUR + 1);
    const later = await guest('Cy', null, '3.3.3.3');
    await guestPin(later, '3.3.3.3');
    expect(h.email.sent.filter((m) => m.subject.includes('commented on'))).toHaveLength(2);
    // A second comment by the same guest isn't a first comment.
    h.tick(HOUR + 1);
    await guestPin(later, '3.3.3.3');
    expect(h.email.sent.filter((m) => m.subject.includes('commented on'))).toHaveLength(2);
  });

  it('labels decision emails by the name given, with no claim of verification', async () => {
    const cookies = await guest('Totally Real CEO');
    await guestDecide(h.ctx, { token: s.token, assetId: s.v1.assetId, versionId: s.v1.versionId, decision: 'approved', ip: '1.1.1.1' }, cookies);
    const mail = h.email.to(s.actor.email)[0]!;
    expect(mail.subject).toContain('Totally Real CEO approved');
    expect(mail.text).toContain('as the guest entered it');
  });

  it('sends only to saved addresses, with fixed wording', async () => {
    const { id } = await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'Client@Example.test' });
    expect(await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id })).toEqual({ sent: true });
    const mail = h.email.to('client@example.test')[0]!;
    expect(mail.text).toContain(`/r/${s.token}`);
    expect(mail.text).toContain('Homepage');
    await expect(sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: 'someone@else.test' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('escapes names in email HTML', async () => {
    const { actor } = await h.signUp('Mallory');
    const { id: reviewId } = await createReview(h.ctx, actor, { name: '<img src=x onerror=alert(1)>', clientName: 'C' });
    const { id } = await addRecipient(h.ctx, actor, { reviewId, email: 'c@example.test' });
    await sendShare(h.ctx, actor, { reviewId, recipientId: id });
    expect(h.email.to('c@example.test')[0]!.html).not.toContain('<img');
  });

  it('blocks client email at the workspace limit, leaving Copy link', async () => {
    const { id } = await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
    const limit = redline.email.clientEmailsPerWorkspacePerDay;
    for (let i = 0; i < limit; i++) {
      expect(await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id })).toEqual({ sent: true });
    }
    const blocked = await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id });
    expect(blocked).toMatchObject({ sent: false, code: 'workspace_limit' });
    if (!blocked.sent) expect(blocked.message).toMatch(/Copy link still works/);
    expect(h.email.sent).toHaveLength(limit);
    const state = await getShareState(h.ctx, s.actor, s.reviewId);
    expect(state.clientEmailsLeft).toBe(0);
    expect(state.url).toContain(`/r/${s.token}`);
    expect(state.recipients[0]!.lastStatus).toBe('workspace_limit');
    expect(state.recipients[0]!.problem).toMatch(/Copy link/);
    // It's a daily limit: tomorrow works again.
    h.tick(25 * HOUR);
    expect(await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id })).toEqual({ sent: true });
  });

  it('counts replies and new-version notices against the same client limit', async () => {
    const { id } = await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
    const limit = redline.email.clientEmailsPerWorkspacePerDay;
    for (let i = 0; i < limit; i++) await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id });
    const cookies = await guest();
    const pin = await guestPin(cookies);
    const reply = await teamReply(h.ctx, s.actor, { parentId: pin.id, body: 'Reply', internal: false });
    expect(reply.notices[0]).toMatch(/Daily limit reached/);
    expect(h.email.to(typed)).toEqual([]);
    const notified = await notifyClients(h.ctx, s.actor, { versionId: s.v1.versionId });
    expect(notified.results[0]).toMatchObject({ sent: false });
    expect(notified.results[0]!.message).toMatch(/Daily limit reached/);
  });

  it('doesn’t count failed sends against the limit', async () => {
    const { id } = await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
    h.email.errors = ['send_failed'];
    expect(await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id })).toMatchObject({ sent: false, code: 'send_failed' });
    expect((await getShareState(h.ctx, s.actor, s.reviewId)).clientEmailsLeft).toBe(redline.email.clientEmailsPerWorkspacePerDay);
  });

  it.each(['unsubscribed', 'suppressed', 'daily_limit_reached', 'recipient_limit_reached', 'paused', 'not_published'] as const)(
    'shows %s beside the recipient and doesn’t throw',
    async (code) => {
      const { id } = await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
      h.email.errors = [code];
      const result = await sendShare(h.ctx, s.actor, { reviewId: s.reviewId, recipientId: id });
      expect(result).toMatchObject({ sent: false, code });
      const state = await getShareState(h.ctx, s.actor, s.reviewId);
      expect(state.recipients[0]!.problem).toBeTruthy();
    }
  );

  it('never fails the action when email fails', async () => {
    const cookies = await guest();
    h.email.throwNext = true;
    const { id } = await guestPin(cookies);
    expect(id).toBeTruthy();
    h.email.errors = ['send_failed'];
    await expect(teamReply(h.ctx, s.actor, { parentId: id, body: 'Saved anyway', internal: false })).resolves.toHaveProperty('id');
    h.email.throwNext = true;
    await expect(guestDecide(h.ctx, { token: s.token, assetId: s.v1.assetId, versionId: s.v1.versionId, decision: 'approved', ip: '1.1.1.1' }, cookies)).resolves.toBeTruthy();
  });

  it('notifies clients only when asked, and once per version', async () => {
    await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
    h.email.sent = [];
    const v2 = await h.upload(s.actor, { reviewId: s.reviewId, assetId: s.v1.assetId });
    expect(h.email.sent).toEqual([]);
    await notifyClients(h.ctx, s.actor, { versionId: v2.versionId });
    expect(h.email.to('c@example.test')).toHaveLength(1);
    expect(h.email.to('c@example.test')[0]!.subject).toContain('New version');
    await expect(notifyClients(h.ctx, s.actor, { versionId: v2.versionId })).rejects.toThrow(/already notified/);
    expect(h.email.to('c@example.test')).toHaveLength(1);
  });

  it('doesn’t notify guest-typed addresses about new versions', async () => {
    await addRecipient(h.ctx, s.actor, { reviewId: s.reviewId, email: 'c@example.test' });
    const cookies = await guest();
    await guestPin(cookies);
    await notifyClients(h.ctx, s.actor, { versionId: s.v1.versionId });
    expect(h.email.to(typed)).toEqual([]);
  });

  it('caps guest-triggered email per review per day', async () => {
    const cookies = await guest();
    const cap = redline.email.creatorEmailsPerReviewPerDay;
    let decision: 'approved' | 'changes_requested' = 'approved';
    for (let i = 0; i < cap + 5; i++) {
      // A fresh address each time, to stay under the per-address rate limit.
      h.tick(60_000);
      await guestDecide(h.ctx, { token: s.token, assetId: s.v1.assetId, versionId: s.v1.versionId, decision, ip: `10.0.0.${i}` }, cookies);
      decision = decision === 'approved' ? 'changes_requested' : 'approved';
    }
    expect(h.email.to(s.actor.email)).toHaveLength(cap);
    // The decisions themselves were all still recorded.
    const rows = h.sqlite.prepare('SELECT COUNT(*) AS n FROM decisions').get() as { n: number };
    expect(rows.n).toBe(cap + 5);
  });
});
