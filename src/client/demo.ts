import type {
  AssetDTO,
  CommentDTO,
  DecisionDTO,
  InboxItem,
  ReviewRow,
  ReviewSnapshot,
  WorkspaceSettings
} from '~/domain/dto';
import { assetStatus, reviewStatus } from '~/domain/status';
import { redline } from '~/redline.config';
import { landingSample, sampleData } from '~/sample/data';
import type { SampleData } from '~/sample/types';
import type { ReviewApi, ShellData, TeamApi } from './api';

/**
 * Try mode: the whole app over sample data kept in this browser's localStorage.
 * Nothing here calls the server, so it makes no writes and creates no real files,
 * links, or email.
 */
const STORAGE_KEY = 'redline:try:v1';

type StoredAsset = Omit<AssetDTO, 'status' | 'decisions'>;
type StoredReview = {
  id: string;
  name: string;
  clientName: string;
  recipients: string[];
  assets: StoredAsset[];
};
type StoredActivity = Omit<InboxItem, 'unread' | 'reviewName' | 'clientName' | 'assetName'>;

export type DemoStore = {
  studio: { name: string; accentColor: string; logoUrl: string };
  me: { id: string; name: string; email: string };
  members: SampleData['members'];
  guestName: string;
  reviews: StoredReview[];
  comments: (CommentDTO & { reviewId: string; guestAuthored: boolean })[];
  decisions: (DecisionDTO & { reviewId: string })[];
  activity: StoredActivity[];
  readIds: string[];
};

export const minutesAgo = (minutes: number, now: number) =>
  new Date(now - minutes * 60_000).toISOString();

/** Sample content, shaped like what the server sends. */
export function seedStore(now = Date.now()): DemoStore {
  const data = sampleData();
  const reviews: StoredReview[] = [];
  const comments: DemoStore['comments'] = [];
  const decisions: DemoStore['decisions'] = [];
  const activity: StoredActivity[] = [];

  for (const review of data.reviews) {
    const assets: StoredAsset[] = [];
    for (const asset of review.assets) {
      const versions = asset.versions.map((version) => ({
        id: version.id,
        number: version.number,
        kind: version.kind,
        originalName: version.originalName,
        originalSize: version.originalSize,
        pageCount: version.pages.length,
        createdAt: minutesAgo(version.minutesAgo, now),
        createdByName: version.createdByName,
        downloadUrl: null,
        notifiedAt: null,
        pages: version.pages.map((page, index) => ({
          id: `${version.id}-p${index + 1}`,
          number: index + 1,
          width: page.width,
          height: page.height,
          url: page.src
        }))
      }));
      assets.push({
        id: asset.id,
        name: asset.name,
        currentVersionId: versions[versions.length - 1]!.id,
        versions
      });
      for (const version of asset.versions) {
        const counters = { public: 0, internal: 0 };
        for (const comment of version.comments) {
          const internal = Boolean(comment.internal);
          let pin: number | null = null;
          if (!comment.parentId) {
            const scope = internal ? 'internal' : 'public';
            counters[scope] += 1;
            pin = counters[scope];
          }
          comments.push({
            id: comment.id,
            reviewId: review.id,
            assetId: asset.id,
            versionId: version.id,
            pageNumber: comment.pageNumber,
            parentId: comment.parentId ?? null,
            pin,
            x: comment.x ?? null,
            y: comment.y ?? null,
            body: comment.body,
            authorName: comment.authorName,
            authorKind: comment.authorKind,
            internal,
            resolvedAt:
              comment.resolvedMinutesAgo !== undefined
                ? minutesAgo(comment.resolvedMinutesAgo, now)
                : null,
            resolvedByName: comment.resolvedByName ?? null,
            fromVersion: comment.fromVersion ?? null,
            createdAt: minutesAgo(comment.minutesAgo, now),
            editedAt: null,
            deleted: false,
            canEdit: false,
            canDelete: false,
            guestAuthored: comment.authorKind === 'guest'
          });
          if (comment.authorKind === 'guest' && !comment.fromVersion) {
            activity.push({
              id: `act-${comment.id}`,
              kind: 'guest_comment',
              reviewId: review.id,
              assetId: asset.id,
              versionNumber: version.number,
              commentId: comment.id,
              decision: null,
              actorName: comment.authorName,
              excerpt: comment.body.length > 200 ? `${comment.body.slice(0, 197)}…` : comment.body,
              createdAt: minutesAgo(comment.minutesAgo, now)
            });
          }
        }
      }
      for (const decision of asset.decisions) {
        const version = asset.versions.find((v) => v.number === decision.versionNumber)!;
        const createdAt = minutesAgo(decision.minutesAgo, now);
        decisions.push({
          id: decision.id,
          reviewId: review.id,
          assetId: asset.id,
          versionId: version.id,
          versionNumber: decision.versionNumber,
          decision: decision.decision,
          name: decision.name,
          createdAt
        });
        activity.push({
          id: `act-${decision.id}`,
          kind: 'decision',
          reviewId: review.id,
          assetId: asset.id,
          versionNumber: decision.versionNumber,
          commentId: null,
          decision: decision.decision,
          actorName: decision.name,
          excerpt:
            decision.decision === 'approved'
              ? `Approved ${asset.name}, V${decision.versionNumber}`
              : `Requested changes on ${asset.name}, V${decision.versionNumber}`,
          createdAt
        });
      }
    }
    reviews.push({
      id: review.id,
      name: review.name,
      clientName: review.clientName,
      recipients: review.recipients,
      assets
    });
  }

  activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const me = data.members[0]!;
  return {
    studio: {
      name: data.studio.name,
      accentColor: data.studio.accentColor,
      logoUrl: data.studio.logoSrc
    },
    me: { id: me.id, name: me.name, email: me.email },
    members: data.members,
    guestName: data.guestName,
    reviews,
    comments,
    decisions,
    activity,
    // The four newest start unread, so the Inbox has something to show.
    readIds: activity.slice(4).map((item) => item.id)
  };
}

export function readStore(): DemoStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DemoStore;
  } catch {
    // Corrupt or blocked storage falls back to fresh sample data.
  }
  const store = seedStore();
  writeStore(store);
  return store;
}

function writeStore(store: DemoStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage refused: changes last for this page view only.
  }
}

export function resetStore() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('redline:draft:review-')) window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing else to do.
  }
}

const reviewSnapshot = (
  store: DemoStore,
  review: StoredReview,
  viewer: 'team' | 'guest'
): ReviewSnapshot => {
  const assets: AssetDTO[] = review.assets.map((asset) => {
    const own = store.decisions.filter((d) => d.assetId === asset.id);
    return {
      ...asset,
      status: assetStatus(asset.currentVersionId, own),
      decisions: own
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(({ reviewId: _reviewId, ...decision }) => decision)
    };
  });
  const isGuest = viewer === 'guest';
  const comments = store.comments
    .filter((c) => c.reviewId === review.id && !(isGuest && c.internal))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ reviewId: _reviewId, guestAuthored, ...comment }): CommentDTO => {
      const mine = isGuest
        ? guestAuthored && comment.authorName === store.guestName
        : comment.authorKind === 'team' && comment.authorName === store.me.name;
      return {
        ...comment,
        canEdit: mine && !comment.deleted,
        canDelete: !comment.deleted && (mine || !isGuest)
      };
    });
  return {
    viewer,
    reviewId: review.id,
    name: review.name,
    clientName: review.clientName,
    status: reviewStatus(assets.map((a) => a.status)),
    brand: {
      name: store.studio.name,
      accentColor: store.studio.accentColor,
      logoUrl: store.studio.logoUrl
    },
    allowDownloads: false,
    assets,
    comments,
    guest: isGuest ? { name: store.guestName, email: null } : null
  };
};

const excerpt = (body: string) =>
  body.length > 200 ? `${body.slice(0, 197)}…` : body;

function requireBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write something first.');
  if (trimmed.length > redline.limits.commentMaxLength) {
    throw new Error(`Comments can be up to ${redline.limits.commentMaxLength} characters.`);
  }
  return trimmed;
}

/** A review over the Try store, as the team or as the client. */
export function demoReviewApi(reviewId: string, viewer: 'team' | 'guest'): ReviewApi {
  const mutate = <T>(change: (store: DemoStore, review: StoredReview) => T) => {
    const store = readStore();
    const review = store.reviews.find((r) => r.id === reviewId);
    if (!review) throw new Error('Not found.');
    const result = change(store, review);
    writeStore(store);
    return result;
  };
  const authorName = (store: DemoStore) =>
    viewer === 'guest' ? store.guestName : store.me.name;
  const pushGuestActivity = (
    store: DemoStore,
    comment: { id: string; assetId: string; versionId: string; body: string },
    review: StoredReview
  ) => {
    const version = review.assets
      .flatMap((a) => a.versions)
      .find((v) => v.id === comment.versionId);
    store.activity.unshift({
      id: `act-${comment.id}`,
      kind: 'guest_comment',
      reviewId: review.id,
      assetId: comment.assetId,
      versionNumber: version?.number ?? null,
      commentId: comment.id,
      decision: null,
      actorName: store.guestName,
      excerpt: excerpt(comment.body),
      createdAt: new Date().toISOString()
    });
  };

  return {
    queryKey: ['review', 'try', viewer, reviewId],
    poll: false,
    identity: 'none',
    load: async () => {
      const store = readStore();
      const review = store.reviews.find((r) => r.id === reviewId);
      if (!review) throw new Error('Not found.');
      return reviewSnapshot(store, review, viewer);
    },
    addPin: async (input) =>
      mutate((store, review) => {
        const asset = review.assets.find((a) =>
          a.versions.some((v) => v.id === input.versionId)
        )!;
        const internal = viewer === 'team' && input.internal;
        const pins = store.comments.filter(
          (c) => c.versionId === input.versionId && c.internal === internal && !c.parentId
        );
        const body = requireBody(input.body);
        const comment = {
          id: `try-${crypto.randomUUID()}`,
          reviewId,
          assetId: asset.id,
          versionId: input.versionId,
          pageNumber: input.pageNumber,
          parentId: null,
          pin: Math.max(0, ...pins.map((p) => p.pin ?? 0)) + 1,
          x: input.x,
          y: input.y,
          body,
          authorName: authorName(store),
          authorKind: viewer === 'guest' ? ('guest' as const) : ('team' as const),
          internal,
          resolvedAt: null,
          resolvedByName: null,
          fromVersion: null,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deleted: false,
          canEdit: true,
          canDelete: true,
          guestAuthored: viewer === 'guest'
        };
        store.comments.push(comment);
        if (viewer === 'guest') pushGuestActivity(store, comment, review);
      }),
    reply: async (input) =>
      mutate((store, review) => {
        const parent = store.comments.find((c) => c.id === input.parentId);
        if (!parent) throw new Error('Not found.');
        const body = requireBody(input.body);
        const comment = {
          ...parent,
          id: `try-${crypto.randomUUID()}`,
          parentId: parent.parentId ?? parent.id,
          pin: null,
          x: null,
          y: null,
          body,
          authorName: authorName(store),
          authorKind: viewer === 'guest' ? ('guest' as const) : ('team' as const),
          internal: parent.internal || (viewer === 'team' && input.internal),
          resolvedAt: null,
          resolvedByName: null,
          fromVersion: null,
          createdAt: new Date().toISOString(),
          editedAt: null,
          guestAuthored: viewer === 'guest'
        };
        store.comments.push(comment);
        if (viewer === 'guest') pushGuestActivity(store, comment, review);
        return { notices: [] };
      }),
    edit: async ({ id, body }) =>
      mutate((store) => {
        const comment = store.comments.find((c) => c.id === id);
        if (comment) {
          comment.body = requireBody(body);
          comment.editedAt = new Date().toISOString();
        }
      }),
    remove: async (id) =>
      mutate((store) => {
        const hasReplies = store.comments.some(
          (c) => c.parentId === id && !c.deleted
        );
        store.activity = store.activity.filter((a) => a.commentId !== id);
        if (hasReplies) {
          const comment = store.comments.find((c) => c.id === id);
          if (comment) {
            comment.deleted = true;
            comment.body = '';
            comment.authorName = '';
          }
        } else {
          store.comments = store.comments.filter((c) => c.id !== id);
        }
      }),
    setResolved: async ({ id, resolved }) =>
      mutate((store) => {
        const comment = store.comments.find((c) => c.id === id);
        const root = comment?.parentId
          ? store.comments.find((c) => c.id === comment.parentId)
          : comment;
        if (root) {
          root.resolvedAt = resolved ? new Date().toISOString() : null;
          root.resolvedByName = resolved ? authorName(store) : null;
        }
      }),
    ...(viewer === 'guest'
      ? {
          decide: async (input: {
            assetId: string;
            versionId: string;
            decision: 'approved' | 'changes_requested';
          }) =>
            mutate((store, review) => {
              const asset = review.assets.find((a) => a.id === input.assetId)!;
              const version = asset.versions.find((v) => v.id === input.versionId)!;
              const createdAt = new Date().toISOString();
              store.decisions.push({
                id: `try-${crypto.randomUUID()}`,
                reviewId,
                assetId: asset.id,
                versionId: version.id,
                versionNumber: version.number,
                decision: input.decision,
                name: store.guestName,
                createdAt
              });
              store.activity.unshift({
                id: `try-${crypto.randomUUID()}`,
                kind: 'decision',
                reviewId,
                assetId: asset.id,
                versionNumber: version.number,
                commentId: null,
                decision: input.decision,
                actorName: store.guestName,
                excerpt:
                  input.decision === 'approved'
                    ? `Approved ${asset.name}, V${version.number}`
                    : `Requested changes on ${asset.name}, V${version.number}`,
                createdAt
              });
            }),
          sendFeedback: async () =>
            mutate((store) => {
              const count = store.comments.filter(
                (c) => c.reviewId === reviewId && c.guestAuthored && c.id.startsWith('try-')
              ).length;
              if (!count) throw new Error('You have no new comments to send yet.');
              store.activity.unshift({
                id: `try-${crypto.randomUUID()}`,
                kind: 'feedback',
                reviewId,
                assetId: null,
                versionNumber: null,
                commentId: null,
                decision: null,
                actorName: store.guestName,
                excerpt: `Sent feedback with ${count} ${count === 1 ? 'comment' : 'comments'}`,
                createdAt: new Date().toISOString()
              });
              return { sent: true, count };
            }),
          report: async () => undefined
        }
      : {})
  };
}

export const demoTeamApi: TeamApi = {
  scope: 'try',
  paths: {
    reviews: '/try',
    inbox: '/try/inbox',
    settings: '/try/settings',
    review: (id) => `/try/reviews/${id}`
  },
  getShell: async (): Promise<ShellData> => {
    const store = readStore();
    return {
      user: store.me,
      activeId: 'try',
      workspaces: [{ id: 'try', name: store.studio.name, role: 'owner', active: true }]
    };
  },
  listReviews: async (): Promise<ReviewRow[]> => {
    const store = readStore();
    return store.reviews
      .map((review) => {
        const snapshot = reviewSnapshot(store, review, 'team');
        const current = new Set(review.assets.map((a) => a.currentVersionId));
        const activity = store.activity.filter((a) => a.reviewId === review.id);
        const times = [
          ...store.comments.filter((c) => c.reviewId === review.id).map((c) => c.createdAt),
          ...activity.map((a) => a.createdAt),
          ...review.assets.flatMap((a) => a.versions.map((v) => v.createdAt))
        ].sort();
        return {
          id: review.id,
          name: review.name,
          clientName: review.clientName,
          status: snapshot.status,
          assetCount: review.assets.length,
          openComments: snapshot.comments.filter(
            (c) => !c.parentId && !c.resolvedAt && !c.deleted && current.has(c.versionId)
          ).length,
          unread: activity.filter((a) => !store.readIds.includes(a.id)).length,
          lastActivityAt: times[times.length - 1] ?? new Date().toISOString()
        };
      })
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  },
  createReview: async (input) => {
    const store = readStore();
    const id = `try-review-${crypto.randomUUID()}`;
    store.reviews.unshift({
      id,
      name: input.name.trim(),
      clientName: input.clientName.trim(),
      recipients: [],
      assets: []
    });
    writeStore(store);
    return { id };
  },
  listInbox: async () => {
    const store = readStore();
    const items: InboxItem[] = store.activity.map((item) => {
      const review = store.reviews.find((r) => r.id === item.reviewId);
      const asset = review?.assets.find((a) => a.id === item.assetId);
      return {
        ...item,
        reviewName: review?.name ?? '',
        clientName: review?.clientName ?? '',
        assetName: asset?.name ?? null,
        unread: !store.readIds.includes(item.id)
      };
    });
    return { items, unread: items.filter((item) => item.unread).length };
  },
  markRead: async (ids) => {
    const store = readStore();
    store.readIds = Array.from(new Set([...store.readIds, ...ids]));
    writeStore(store);
  },
  markAllRead: async () => {
    const store = readStore();
    store.readIds = store.activity.map((item) => item.id);
    writeStore(store);
  },
  getSettings: async (): Promise<WorkspaceSettings> => {
    const store = readStore();
    return {
      id: 'try',
      name: store.studio.name,
      accentColor: store.studio.accentColor,
      logoUrl: store.studio.logoUrl,
      role: 'owner',
      members: store.members.map((member, index) => ({
        userId: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        joinedAt: new Date(Date.now() - (120 - index * 20) * 86_400_000).toISOString(),
        isYou: index === 0
      })),
      invites: [],
      usedBytes: store.reviews
        .flatMap((r) => r.assets.flatMap((a) => a.versions))
        .reduce((sum, version) => sum + version.originalSize, 0),
      limitBytes: redline.limits.workspaceStorageBytes,
      maxFileBytes: redline.limits.maxFileBytes,
      storageReadOnly: false
    };
  },
  updateWorkspace: async ({ name, accentColor }) => {
    const store = readStore();
    store.studio.name = name.trim() || store.studio.name;
    store.studio.accentColor = accentColor;
    writeStore(store);
  }
};

/**
 * The landing page's canvas: one mockup in memory, nothing stored, ready for a
 * visitor to drop a pin with no name or account.
 */
export function landingReviewApi(store = seedStore()): ReviewApi {
  const review = store.reviews.find((r) => r.id === landingSample.reviewId)!;
  const asset = review.assets.find((a) => a.id === landingSample.assetId)!;
  let comments: CommentDTO[] = store.comments
    .filter(
      (c) =>
        c.versionId === landingSample.versionId && !c.internal && !c.parentId
    )
    .slice(0, 5)
    .map(({ reviewId: _reviewId, guestAuthored: _guest, ...comment }) => ({
      ...comment,
      canEdit: false,
      canDelete: false
    }));
  const version = asset.versions.find((v) => v.id === landingSample.versionId)!;
  const snapshot = (): ReviewSnapshot => ({
    viewer: 'guest',
    reviewId: 'landing',
    name: review.name,
    clientName: review.clientName,
    status: 'in_review',
    brand: {
      name: store.studio.name,
      accentColor: redline.colors.accent,
      logoUrl: null
    },
    allowDownloads: false,
    assets: [
      {
        ...asset,
        status: 'in_review',
        currentVersionId: version.id,
        versions: [version],
        decisions: []
      }
    ],
    comments,
    guest: null
  });
  return {
    queryKey: ['review', 'landing'],
    poll: false,
    identity: 'none',
    load: async () => snapshot(),
    addPin: async (input) => {
      const pin = Math.max(0, ...comments.map((c) => c.pin ?? 0)) + 1;
      comments = [
        ...comments,
        {
          id: `landing-${crypto.randomUUID()}`,
          assetId: asset.id,
          versionId: input.versionId,
          pageNumber: input.pageNumber,
          parentId: null,
          pin,
          x: input.x,
          y: input.y,
          body: requireBody(input.body),
          authorName: 'You',
          authorKind: 'guest',
          internal: false,
          resolvedAt: null,
          resolvedByName: null,
          fromVersion: null,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deleted: false,
          canEdit: true,
          canDelete: true
        }
      ];
    },
    reply: async (input) => {
      const parent = comments.find((c) => c.id === input.parentId)!;
      comments = [
        ...comments,
        {
          ...parent,
          id: `landing-${crypto.randomUUID()}`,
          parentId: parent.parentId ?? parent.id,
          pin: null,
          x: null,
          y: null,
          body: requireBody(input.body),
          authorName: 'You',
          authorKind: 'guest',
          createdAt: new Date().toISOString(),
          editedAt: null,
          fromVersion: null,
          canEdit: true,
          canDelete: true
        }
      ];
    },
    edit: async ({ id, body }) => {
      comments = comments.map((c) =>
        c.id === id
          ? { ...c, body: requireBody(body), editedAt: new Date().toISOString() }
          : c
      );
    },
    remove: async (id) => {
      comments = comments.filter((c) => c.id !== id && c.parentId !== id);
    },
    setResolved: async ({ id, resolved }) => {
      comments = comments.map((c) =>
        c.id === id
          ? {
              ...c,
              resolvedAt: resolved ? new Date().toISOString() : null,
              resolvedByName: resolved ? 'You' : null
            }
          : c
      );
    }
  };
}

/** The landing page's first render, shared by server and browser. */
export function landingSnapshot(): Promise<ReviewSnapshot> {
  return landingReviewApi().load();
}
