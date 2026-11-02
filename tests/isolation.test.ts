import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  requireAsset,
  requireComment,
  requireMember,
  requirePage,
  requireReview,
  requireVersion
} from '~/domain/access';
import { teamAddComment, teamDeleteComment, teamEditComment, teamReply, teamSetResolved } from '~/domain/comments';
import { guestAddComment, guestSetIdentity } from '~/domain/guest';
import {
  addRecipient,
  createReview,
  deleteAsset,
  deleteReview,
  getShareState,
  issueNewLink,
  listInbox,
  listReviews,
  markInboxRead,
  notifyClients,
  removeRecipient,
  revokeLink,
  sendShare,
  teamSnapshot,
  updateLink,
  updateReview
} from '~/domain/reviews';
import { abortUpload, addPreview, beginUpload, finalizeVersion, finishOriginal, getUploadLimits } from '~/domain/uploads';
import {
  acceptInvite,
  createInvite,
  deleteWorkspace,
  getLogoObject,
  getSettings,
  leaveWorkspace,
  listInvites,
  previewInvite,
  removeLogo,
  removeMember,
  revokeInvite,
  setLogo,
  switchWorkspace,
  updateWorkspace
} from '~/domain/workspaces';
import { activity, comments, reviewLinks, reviews, workspaceInvites, workspaces } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { makeHarness, memoryCookies, pngBytes, webpBytes, type Harness } from './helpers/harness';

/** Workspace A has real content. Bob is signed in and belongs only to B. */
async function twoWorkspaces(h: Harness) {
  const alice = await h.signUp('Alice Owner');
  const bob = await h.signUp('Bob Outsider');
  const { id: reviewId } = await createReview(h.ctx, alice.actor, {
    name: 'Secret homepage',
    clientName: 'Acme'
  });
  const uploaded = await h.upload(alice.actor, { reviewId });
  const { id: commentId } = await teamAddComment(h.ctx, alice.actor, {
    versionId: uploaded.versionId,
    pageNumber: 1,
    x: 0.5,
    y: 0.5,
    body: 'Secret note',
    internal: false
  });
  const { id: recipientId } = await addRecipient(h.ctx, alice.actor, {
    reviewId,
    email: 'client@example.test'
  });
  const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, reviewId));
  const snapshot = await teamSnapshot(h.ctx, alice.actor, reviewId);
  const pageId = snapshot.assets[0]!.versions[0]!.pages[0]!.id;
  return {
    alice,
    bob,
    reviewId,
    assetId: uploaded.assetId,
    versionId: uploaded.versionId,
    commentId,
    recipientId,
    pageId,
    token: link!.token
  };
}

describe('a member of one workspace can’t reach another workspace', () => {
  let h: Harness;
  let w: Awaited<ReturnType<typeof twoWorkspaces>>;
  beforeEach(async () => {
    h = makeHarness();
    w = await twoWorkspaces(h);
  });

  it('sees none of it in their own lists', async () => {
    expect(await listReviews(h.ctx, w.bob.actor)).toEqual([]);
    expect((await listInbox(h.ctx, w.bob.actor)).items).toEqual([]);
    expect((await getSettings(h.ctx, w.bob.actor)).name).toMatch(/Bob/);
  });

  // Every team entry point that takes an id, called with workspace A's ids as Bob.
  const attempts: Record<string, (x: Harness, w: Awaited<ReturnType<typeof twoWorkspaces>>) => Promise<unknown>> = {
    'requireReview': (x, s) => requireReview(x.ctx, s.bob.actor, s.reviewId),
    'requireAsset': (x, s) => requireAsset(x.ctx, s.bob.actor, s.assetId),
    'requireVersion (original download)': (x, s) => requireVersion(x.ctx, s.bob.actor, s.versionId),
    'requirePage (preview media)': (x, s) => requirePage(x.ctx, s.bob.actor, s.pageId),
    'requireComment': (x, s) => requireComment(x.ctx, s.bob.actor, s.commentId),
    'requireMember': (x, s) => requireMember(x.ctx, s.bob.actor, s.alice.workspaceId),
    'teamSnapshot': (x, s) => teamSnapshot(x.ctx, s.bob.actor, s.reviewId),
    'updateReview': (x, s) => updateReview(x.ctx, s.bob.actor, { reviewId: s.reviewId, name: 'Hacked', clientName: 'Hacked' }),
    'deleteReview': (x, s) => deleteReview(x.ctx, s.bob.actor, s.reviewId),
    'deleteAsset': (x, s) => deleteAsset(x.ctx, s.bob.actor, s.assetId),
    'getShareState (reads the link)': (x, s) => getShareState(x.ctx, s.bob.actor, s.reviewId),
    'updateLink': (x, s) => updateLink(x.ctx, s.bob.actor, { reviewId: s.reviewId, allowDownloads: true }),
    'revokeLink': (x, s) => revokeLink(x.ctx, s.bob.actor, s.reviewId),
    'issueNewLink': (x, s) => issueNewLink(x.ctx, s.bob.actor, s.reviewId),
    'addRecipient': (x, s) => addRecipient(x.ctx, s.bob.actor, { reviewId: s.reviewId, email: 'x@example.test' }),
    'removeRecipient': (x, s) => removeRecipient(x.ctx, s.bob.actor, { reviewId: s.reviewId, recipientId: s.recipientId }),
    'sendShare': (x, s) => sendShare(x.ctx, s.bob.actor, { reviewId: s.reviewId, recipientId: s.recipientId }),
    'notifyClients': (x, s) => notifyClients(x.ctx, s.bob.actor, { versionId: s.versionId }),
    'teamAddComment': (x, s) => teamAddComment(x.ctx, s.bob.actor, { versionId: s.versionId, pageNumber: 1, x: 0.1, y: 0.1, body: 'hi', internal: false }),
    'teamReply': (x, s) => teamReply(x.ctx, s.bob.actor, { parentId: s.commentId, body: 'hi', internal: false }),
    'teamEditComment': (x, s) => teamEditComment(x.ctx, s.bob.actor, { id: s.commentId, body: 'hacked' }),
    'teamDeleteComment': (x, s) => teamDeleteComment(x.ctx, s.bob.actor, s.commentId),
    'teamSetResolved': (x, s) => teamSetResolved(x.ctx, s.bob.actor, { id: s.commentId, resolved: true }),
    'beginUpload to their review': (x, s) => beginUpload(x.ctx, s.bob.actor, { reviewId: s.reviewId, assetId: null, fileName: 'a.png', size: 10, contentType: 'image/png', pageCount: 1, copyOpenComments: false }),
    'beginUpload as a new version of their asset': (x, s) => beginUpload(x.ctx, s.bob.actor, { reviewId: s.reviewId, assetId: s.assetId, fileName: 'a.png', size: 10, contentType: 'image/png', pageCount: 1, copyOpenComments: false }),
    'getUploadLimits': (x, s) => getUploadLimits(x.ctx, s.bob.actor, s.reviewId),
    'finishOriginal': (x, s) => finishOriginal(x.ctx, s.bob.actor, { versionId: s.versionId }),
    'addPreview': (x, s) => addPreview(x.ctx, s.bob.actor, { versionId: s.versionId, pageNumber: 1, bytes: webpBytes(10, 10) }),
    'finalizeVersion': (x, s) => finalizeVersion(x.ctx, s.bob.actor, { versionId: s.versionId }),
    'abortUpload': (x, s) => abortUpload(x.ctx, s.bob.actor, { versionId: s.versionId }),
    'switchWorkspace': (x, s) => switchWorkspace(x.ctx, s.bob.actor, s.alice.workspaceId),
    'updateWorkspace': (x, s) => updateWorkspace(x.ctx, s.bob.actor, { workspaceId: s.alice.workspaceId, name: 'Hacked', accentColor: '#000000' }),
    'setLogo': (x, s) => setLogo(x.ctx, s.bob.actor, { workspaceId: s.alice.workspaceId, bytes: pngBytes() }),
    'removeLogo': (x, s) => removeLogo(x.ctx, s.bob.actor, s.alice.workspaceId),
    'getLogoObject': (x, s) => getLogoObject(x.ctx, s.bob.actor, s.alice.workspaceId),
    'listInvites': (x, s) => listInvites(x.ctx, s.bob.actor, s.alice.workspaceId),
    'createInvite': (x, s) => createInvite(x.ctx, s.bob.actor, { workspaceId: s.alice.workspaceId }),
    'removeMember': (x, s) => removeMember(x.ctx, s.bob.actor, { workspaceId: s.alice.workspaceId, userId: s.alice.actor.id }),
    'leaveWorkspace': (x, s) => leaveWorkspace(x.ctx, s.bob.actor, s.alice.workspaceId),
    'deleteWorkspace': (x, s) => deleteWorkspace(x.ctx, s.bob.actor, s.alice.workspaceId)
  };

  it.each(Object.keys(attempts))('%s is refused as not found', async (name) => {
    await expect(attempts[name]!(h, w)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('leaves workspace A untouched after all of those attempts', async () => {
    for (const attempt of Object.values(attempts)) {
      await attempt(h, w).catch(() => undefined);
    }
    const [review] = await h.db.select().from(reviews).where(eq(reviews.id, w.reviewId));
    expect(review!.name).toBe('Secret homepage');
    const [link] = await h.db.select().from(reviewLinks).where(eq(reviewLinks.reviewId, w.reviewId));
    expect(link!.token).toBe(w.token);
    expect(link!.revokedAt).toBeNull();
    expect(link!.allowDownloads).toBe(false);
    const [comment] = await h.db.select().from(comments).where(eq(comments.id, w.commentId));
    expect(comment!.body).toBe('Secret note');
    expect(comment!.resolvedAt).toBeNull();
    const [workspace] = await h.db.select().from(workspaces).where(eq(workspaces.id, w.alice.workspaceId));
    expect(workspace!.name).toMatch(/Alice/);
    expect(h.storage.deleted).toEqual([]);
    expect(h.email.sent).toEqual([]);
  });

  it('can’t mark another workspace’s Inbox items read', async () => {
    const cookies = memoryCookies();
    await guestSetIdentity(h.ctx, { token: w.token, name: 'Gia', ip: '1.1.1.1' }, cookies);
    await guestAddComment(h.ctx, { token: w.token, versionId: w.versionId, pageNumber: 1, x: 0.2, y: 0.2, body: 'Looks good', internal: false, ip: '1.1.1.1' }, cookies);
    const [item] = await h.db.select().from(activity).where(eq(activity.reviewId, w.reviewId));
    await markInboxRead(h.ctx, w.bob.actor, { ids: [item!.id] });
    const inbox = await listInbox(h.ctx, w.alice.actor);
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]!.unread).toBe(true);
    const rows = await h.sqlite.prepare('SELECT COUNT(*) AS n FROM activity_reads').get() as { n: number };
    expect(rows.n).toBe(0);
  });
});

describe('invite links', () => {
  let h: Harness;
  let w: Awaited<ReturnType<typeof twoWorkspaces>>;
  beforeEach(async () => {
    h = makeHarness();
    w = await twoWorkspaces(h);
  });
  const tokenOf = (url: string) => url.split('/invite/')[1]!;

  it('stores only a hash, so nobody can read a pending link back', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    const rows = await h.db.select().from(workspaceInvites);
    expect(JSON.stringify(rows)).not.toContain(tokenOf(url));
    const listed = await listInvites(h.ctx, w.alice.actor, w.alice.workspaceId);
    expect(JSON.stringify(listed)).not.toContain(tokenOf(url));
  });

  it('can’t be revoked from another workspace, even by that workspace’s owner', async () => {
    await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    const [invite] = await h.db.select().from(workspaceInvites);
    await expect(
      revokeInvite(h.ctx, w.bob.actor, { workspaceId: w.bob.workspaceId, inviteId: invite!.id })
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      revokeInvite(h.ctx, w.bob.actor, { workspaceId: w.alice.workspaceId, inviteId: invite!.id })
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await listInvites(h.ctx, w.alice.actor, w.alice.workspaceId))).toHaveLength(1);
  });

  it('works once, and grants only the member role', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    await acceptInvite(h.ctx, w.bob.actor, tokenOf(url));
    expect((await requireMember(h.ctx, w.bob.actor, w.alice.workspaceId)).role).toBe('member');
    const carol = await h.signUp('Carol Late');
    await expect(acceptInvite(h.ctx, carol.actor, tokenOf(url))).rejects.toMatchObject({ code: 'invite_gone' });
    expect(await previewInvite(h.ctx, tokenOf(url))).toEqual({ state: 'unavailable' });
  });

  it('expires after 7 days', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    h.tick(7 * 24 * 60 * 60 * 1000 - 1000);
    expect((await previewInvite(h.ctx, tokenOf(url))).state).toBe('valid');
    h.tick(2000);
    expect((await previewInvite(h.ctx, tokenOf(url))).state).toBe('unavailable');
    await expect(acceptInvite(h.ctx, w.bob.actor, tokenOf(url))).rejects.toMatchObject({ code: 'invite_gone' });
  });

  it('stops working when revoked', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    const [invite] = await h.db.select().from(workspaceInvites);
    await revokeInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId, inviteId: invite!.id });
    await expect(acceptInvite(h.ctx, w.bob.actor, tokenOf(url))).rejects.toMatchObject({ code: 'invite_gone' });
  });

  it('binds an emailed invite to that address', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId, email: 'carol.late@example.test' });
    await expect(acceptInvite(h.ctx, w.bob.actor, tokenOf(url))).rejects.toMatchObject({ code: 'invite_email' });
    const carol = await h.signUp('Carol Late');
    await expect(acceptInvite(h.ctx, carol.actor, tokenOf(url))).resolves.toMatchObject({ alreadyMember: false });
  });

  it('keeps a member from owner-only actions', async () => {
    const { url } = await createInvite(h.ctx, w.alice.actor, { workspaceId: w.alice.workspaceId });
    await acceptInvite(h.ctx, w.bob.actor, tokenOf(url));
    await expect(createInvite(h.ctx, w.bob.actor, { workspaceId: w.alice.workspaceId })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(deleteWorkspace(h.ctx, w.bob.actor, w.alice.workspaceId)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(removeMember(h.ctx, w.bob.actor, { workspaceId: w.alice.workspaceId, userId: w.alice.actor.id })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(updateWorkspace(h.ctx, w.bob.actor, { workspaceId: w.alice.workspaceId, name: 'X', accentColor: '#000000' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('deleting removes Storage files', () => {
  it('removes every original, preview, and logo with the workspace', async () => {
    const h = makeHarness();
    const { actor, workspaceId } = await h.signUp('Dana Owner');
    const { id: reviewId } = await createReview(h.ctx, actor, { name: 'R', clientName: 'C' });
    await h.upload(actor, { reviewId, pages: 3 });
    await setLogo(h.ctx, actor, { workspaceId, bytes: pngBytes() });
    expect(h.storage.files.size).toBe(5);
    await deleteWorkspace(h.ctx, actor, workspaceId);
    expect(h.storage.files.size).toBe(0);
  });
});

describe('server entry points', () => {
  // A route guard doesn't protect a server function, so check each one directly.
  const dir = join(import.meta.dirname, '../src/server');
  const files = readdirSync(dir).filter((name) => name.endsWith('.functions.ts'));

  it('finds the server function files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.filter((name) => name.startsWith('team')))(
    '%s puts every function behind the team session middleware',
    (name) => {
      const source = readFileSync(join(dir, name), 'utf8');
      const fns = source.split('createServerFn(').slice(1);
      expect(fns.length).toBeGreaterThan(0);
      for (const fn of fns) {
        expect(fn.slice(0, 120)).toContain('.middleware([teamMiddleware])');
      }
    }
  );

  it.each(files.filter((name) => name.startsWith('guest')))(
    '%s takes no workspace or user ids from the browser',
    (name) => {
      const source = readFileSync(join(dir, name), 'utf8');
      expect(source).not.toMatch(/workspaceId|userId/);
    }
  );
});
