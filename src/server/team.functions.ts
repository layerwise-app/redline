import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as comments from '~/domain/comments';
import * as reviews from '~/domain/reviews';
import * as uploads from '~/domain/uploads';
import { id } from '~/domain/validate';
import * as workspaces from '~/domain/workspaces';
import { teamMiddleware } from './middleware';

const text = z.string().max(5000);
const reviewInput = z.object({ reviewId: id });

export const getShell = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .handler(({ context }) => workspaces.listWorkspaces(context.ctx, context.actor));

export const switchWorkspaceFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id }))
  .handler(({ context, data }) =>
    workspaces.switchWorkspace(context.ctx, context.actor, data.workspaceId)
  );

export const listReviewsFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .handler(({ context }) => reviews.listReviews(context.ctx, context.actor));

export const createReviewFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ name: text, clientName: text }))
  .handler(({ context, data }) =>
    reviews.createReview(context.ctx, context.actor, data)
  );

export const updateReviewFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ reviewId: id, name: text, clientName: text }))
  .handler(({ context, data }) =>
    reviews.updateReview(context.ctx, context.actor, data)
  );

export const deleteReviewFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    reviews.deleteReview(context.ctx, context.actor, data.reviewId)
  );

export const deleteAssetFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ assetId: id }))
  .handler(({ context, data }) =>
    reviews.deleteAsset(context.ctx, context.actor, data.assetId)
  );

export const teamSnapshotFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    reviews.teamSnapshot(context.ctx, context.actor, data.reviewId)
  );

// Inbox

export const listInboxFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .handler(({ context }) => reviews.listInbox(context.ctx, context.actor));

export const markInboxReadFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ ids: z.array(id).max(200) }))
  .handler(({ context, data }) =>
    reviews.markInboxRead(context.ctx, context.actor, data)
  );

export const markInboxAllReadFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .handler(({ context }) => reviews.markInboxAllRead(context.ctx, context.actor));

// Comments

export const teamAddPinFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(
    z.object({
      versionId: id,
      pageNumber: z.number(),
      x: z.number(),
      y: z.number(),
      body: text,
      internal: z.boolean()
    })
  )
  .handler(({ context, data }) =>
    comments.teamAddComment(context.ctx, context.actor, data)
  );

export const teamReplyFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ parentId: id, body: text, internal: z.boolean() }))
  .handler(({ context, data }) =>
    comments.teamReply(context.ctx, context.actor, data)
  );

export const teamEditFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ id, body: text }))
  .handler(({ context, data }) =>
    comments.teamEditComment(context.ctx, context.actor, data)
  );

export const teamRemoveFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ id }))
  .handler(({ context, data }) =>
    comments.teamDeleteComment(context.ctx, context.actor, data.id)
  );

export const teamResolveFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ id, resolved: z.boolean() }))
  .handler(({ context, data }) =>
    comments.teamSetResolved(context.ctx, context.actor, data)
  );

// Link and sharing

export const getShareStateFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    reviews.getShareState(context.ctx, context.actor, data.reviewId)
  );

export const updateLinkFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(
    z.object({
      reviewId: id,
      password: z.string().max(200).nullable().optional(),
      expiresAt: z.string().max(40).nullable().optional(),
      allowDownloads: z.boolean().optional()
    })
  )
  .handler(({ context, data }) =>
    reviews.updateLink(context.ctx, context.actor, data)
  );

export const revokeLinkFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    reviews.revokeLink(context.ctx, context.actor, data.reviewId)
  );

export const issueNewLinkFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    reviews.issueNewLink(context.ctx, context.actor, data.reviewId)
  );

export const addRecipientFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ reviewId: id, email: z.string().max(320) }))
  .handler(({ context, data }) =>
    reviews.addRecipient(context.ctx, context.actor, data)
  );

export const removeRecipientFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ reviewId: id, recipientId: id }))
  .handler(({ context, data }) =>
    reviews.removeRecipient(context.ctx, context.actor, data)
  );

export const sendShareFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ reviewId: id, recipientId: id }))
  .handler(({ context, data }) =>
    reviews.sendShare(context.ctx, context.actor, data)
  );

export const notifyClientsFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ versionId: id }))
  .handler(({ context, data }) =>
    reviews.notifyClients(context.ctx, context.actor, data)
  );

// Uploads

export const getUploadLimitsFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .validator(reviewInput)
  .handler(({ context, data }) =>
    uploads.getUploadLimits(context.ctx, context.actor, data.reviewId)
  );

export const beginUploadFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(
    z.object({
      reviewId: id,
      assetId: id.nullable(),
      fileName: z.string().max(400),
      size: z.number(),
      contentType: z.string().max(200),
      pageCount: z.number(),
      copyOpenComments: z.boolean()
    })
  )
  .handler(({ context, data }) =>
    uploads.beginUpload(context.ctx, context.actor, data)
  );

export const finishOriginalFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ versionId: id }))
  .handler(({ context, data }) =>
    uploads.finishOriginal(context.ctx, context.actor, data)
  );

export const finalizeVersionFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ versionId: id }))
  .handler(({ context, data }) =>
    uploads.finalizeVersion(context.ctx, context.actor, data)
  );

export const abortUploadFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ versionId: id }))
  .handler(({ context, data }) =>
    uploads.abortUpload(context.ctx, context.actor, data)
  );

// Workspace settings

export const getSettingsFn = createServerFn({ method: 'GET' })
  .middleware([teamMiddleware])
  .handler(({ context }) => workspaces.getSettings(context.ctx, context.actor));

export const updateWorkspaceFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(
    z.object({ workspaceId: id, name: text, accentColor: z.string().max(20) })
  )
  .handler(({ context, data }) =>
    workspaces.updateWorkspace(context.ctx, context.actor, data)
  );

export const removeLogoFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id }))
  .handler(({ context, data }) =>
    workspaces.removeLogo(context.ctx, context.actor, data.workspaceId)
  );

export const createInviteFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(
    z.object({ workspaceId: id, email: z.string().max(320).nullable() })
  )
  .handler(({ context, data }) =>
    workspaces.createInvite(context.ctx, context.actor, data)
  );

export const revokeInviteFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id, inviteId: id }))
  .handler(({ context, data }) =>
    workspaces.revokeInvite(context.ctx, context.actor, data)
  );

export const acceptInviteFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ token: z.string().max(64) }))
  .handler(({ context, data }) =>
    workspaces.acceptInvite(context.ctx, context.actor, data.token)
  );

export const removeMemberFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id, userId: id }))
  .handler(({ context, data }) =>
    workspaces.removeMember(context.ctx, context.actor, data)
  );

export const leaveWorkspaceFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id }))
  .handler(({ context, data }) =>
    workspaces.leaveWorkspace(context.ctx, context.actor, data.workspaceId)
  );

export const deleteWorkspaceFn = createServerFn({ method: 'POST' })
  .middleware([teamMiddleware])
  .validator(z.object({ workspaceId: id }))
  .handler(({ context, data }) =>
    workspaces.deleteWorkspace(context.ctx, context.actor, data.workspaceId)
  );
