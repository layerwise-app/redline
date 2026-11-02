import {
  guestAddPinFn,
  guestDecideFn,
  guestEditFn,
  guestFeedbackFn,
  guestLoadFn,
  guestRemoveFn,
  guestReplyFn,
  guestResolveFn,
  reportFn,
  setIdentityFn
} from '~/server/guest.functions';
import {
  createReviewFn,
  getSettingsFn,
  getShell,
  listInboxFn,
  listReviewsFn,
  markInboxAllReadFn,
  markInboxReadFn,
  switchWorkspaceFn,
  teamAddPinFn,
  teamEditFn,
  teamRemoveFn,
  teamReplyFn,
  teamResolveFn,
  teamSnapshotFn,
  updateWorkspaceFn
} from '~/server/team.functions';
import type { ReviewSnapshot } from '~/domain/dto';
import type { ReviewApi, TeamApi } from './api';

export const serverTeamApi: TeamApi = {
  scope: 'server',
  paths: {
    reviews: '/dashboard',
    inbox: '/dashboard/inbox',
    settings: '/dashboard/settings',
    review: (id) => `/dashboard/reviews/${id}`
  },
  getShell: () => getShell(),
  switchWorkspace: (workspaceId) => switchWorkspaceFn({ data: { workspaceId } }),
  listReviews: () => listReviewsFn(),
  createReview: (data) => createReviewFn({ data }),
  listInbox: () => listInboxFn(),
  markRead: (ids) => markInboxReadFn({ data: { ids } }),
  markAllRead: () => markInboxAllReadFn(),
  getSettings: () => getSettingsFn(),
  updateWorkspace: (data) => updateWorkspaceFn({ data })
};

export function teamReviewApi(reviewId: string): ReviewApi {
  return {
    queryKey: ['review', 'team', reviewId],
    poll: true,
    identity: 'none',
    load: () => teamSnapshotFn({ data: { reviewId } }),
    addPin: (data) => teamAddPinFn({ data }),
    reply: (data) => teamReplyFn({ data }),
    edit: (data) => teamEditFn({ data }),
    remove: (id) => teamRemoveFn({ data: { id } }),
    setResolved: (data) => teamResolveFn({ data })
  };
}

/** Thrown when polling finds the link was closed while the page was open. */
export class LinkClosedError extends Error {}

export function guestReviewApi(token: string): ReviewApi {
  return {
    queryKey: ['review', 'guest', token],
    poll: true,
    identity: 'required',
    load: async (): Promise<ReviewSnapshot> => {
      const result = await guestLoadFn({ data: { token } });
      if (result.state !== 'ok') throw new LinkClosedError(result.state);
      return result.snapshot;
    },
    addPin: ({ internal: _internal, ...data }) =>
      guestAddPinFn({ data: { ...data, token } }),
    reply: ({ internal: _internal, ...data }) =>
      guestReplyFn({ data: { ...data, token } }),
    edit: (data) => guestEditFn({ data: { ...data, token } }),
    remove: (id) => guestRemoveFn({ data: { id, token } }),
    setResolved: (data) => guestResolveFn({ data: { ...data, token } }),
    setIdentity: (data) => setIdentityFn({ data: { ...data, token } }),
    decide: (data) => guestDecideFn({ data: { ...data, token } }),
    sendFeedback: () => guestFeedbackFn({ data: { token } }),
    report: (data) => reportFn({ data: { ...data, token } })
  };
}
