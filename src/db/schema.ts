import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';

// Better Auth tables. After adding an auth plugin, run
// `pnpm run auth:generate --yes`, copy only its new tables and columns from the
// generated `auth-schema.ts` into this section, then delete that file.

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' })
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by')
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp'
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp'
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  )
});

// Redline tables. Everything hangs off a workspace, and every row a browser can
// name carries `workspace_id` so access checks need no joins to get it wrong.

const newId = () => crypto.randomUUID();
const ms = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  accentColor: text('accent_color').notNull(),
  logoKey: text('logo_key'),
  logoSize: integer('logo_size').notNull().default(0),
  createdAt: ms('created_at')
    .notNull()
    .$defaultFn(() => new Date())
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    lastActiveAt: ms('last_active_at').notNull(),
    /** Everything in the Inbox up to here counts as read for this member. */
    inboxSeenAt: ms('inbox_seen_at'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId)
  ]
);

export const workspaceInvites = sqliteTable(
  'workspace_invites',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token. The link is shown once and can't be read back. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Set for email invites: only this address may accept. */
    email: text('email'),
    createdById: text('created_by_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    expiresAt: ms('expires_at').notNull(),
    acceptedAt: ms('accepted_at'),
    acceptedById: text('accepted_by_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    revokedAt: ms('revoked_at'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('workspace_invites_workspace_idx').on(t.workspaceId)]
);

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    clientName: text('client_name').notNull(),
    createdById: text('created_by_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    lastActivityAt: ms('last_activity_at').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('reviews_workspace_idx').on(t.workspaceId, t.lastActivityAt)]
);

/** One link per review. Issuing a new one replaces the token in place. */
export const reviewLinks = sqliteTable('review_links', {
  reviewId: text('review_id')
    .primaryKey()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  /** 128 random bits, base64url. Kept readable so Copy link always works. */
  token: text('token').notNull().unique(),
  passwordHash: text('password_hash'),
  /** Bumped on every password change, which signs existing unlocks out. */
  passwordVersion: integer('password_version').notNull().default(0),
  expiresAt: ms('expires_at'),
  allowDownloads: integer('allow_downloads', { mode: 'boolean' })
    .notNull()
    .default(false),
  revokedAt: ms('revoked_at'),
  createdAt: ms('created_at').notNull()
});

/** Client addresses saved on a review. Share only ever sends to these. */
export const reviewRecipients = sqliteTable(
  'review_recipients',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    addedById: text('added_by_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    lastSentAt: ms('last_sent_at'),
    lastStatus: text('last_status'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [uniqueIndex('review_recipients_unique').on(t.reviewId, t.email)]
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Set once the first version is ready. */
    currentVersionId: text('current_version_id'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('assets_review_idx').on(t.reviewId)]
);

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    kind: text('kind', { enum: ['image', 'pdf'] }).notNull(),
    originalKey: text('original_key').notNull(),
    originalName: text('original_name').notNull(),
    originalSize: integer('original_size').notNull(),
    contentType: text('content_type').notNull(),
    pageCount: integer('page_count').notNull(),
    status: text('status', { enum: ['uploading', 'processing', 'ready'] })
      .notNull()
      .default('uploading'),
    uploadId: text('upload_id'),
    /** Copy this version's open comments forward once the upload finishes. */
    copyFromVersionId: text('copy_from_version_id'),
    notifiedAt: ms('notified_at'),
    createdById: text('created_by_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    createdByName: text('created_by_name').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [
    index('versions_workspace_idx').on(t.workspaceId),
    uniqueIndex('versions_asset_number_unique').on(t.assetId, t.number)
  ]
);

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    previewKey: text('preview_key').notNull(),
    previewSize: integer('preview_size').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull()
  },
  (t) => [
    index('pages_workspace_idx').on(t.workspaceId),
    uniqueIndex('pages_version_number_unique').on(t.versionId, t.number)
  ]
);

export const guests = sqliteTable(
  'guests',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Optional. Only ever used when a team member replies to this guest. */
    email: text('email'),
    lastFeedbackAt: ms('last_feedback_at'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('guests_review_idx').on(t.reviewId)]
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    parentId: text('parent_id').references((): AnySQLiteColumn => comments.id, {
      onDelete: 'cascade'
    }),
    pinNumber: integer('pin_number'),
    x: real('x'),
    y: real('y'),
    body: text('body').notNull(),
    authorKind: text('author_kind', { enum: ['team', 'guest'] }).notNull(),
    authorUserId: text('author_user_id').references(() => user.id, {
      onDelete: 'set null'
    }),
    guestId: text('guest_id').references(() => guests.id, {
      onDelete: 'set null'
    }),
    authorName: text('author_name').notNull(),
    internal: integer('internal', { mode: 'boolean' }).notNull().default(false),
    resolvedAt: ms('resolved_at'),
    resolvedByName: text('resolved_by_name'),
    fromVersionNumber: integer('from_version_number'),
    sourceCommentId: text('source_comment_id'),
    deletedAt: ms('deleted_at'),
    editedAt: ms('edited_at'),
    createdAt: ms('created_at').notNull()
  },
  (t) => [
    index('comments_review_idx').on(t.reviewId, t.internal),
    index('comments_version_idx').on(t.versionId),
    index('comments_parent_idx').on(t.parentId),
    index('comments_guest_idx').on(t.guestId)
  ]
);

/** Append-only: a new version resets status but never removes this history. */
export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    decision: text('decision', {
      enum: ['approved', 'changes_requested']
    }).notNull(),
    guestId: text('guest_id').references(() => guests.id, {
      onDelete: 'set null'
    }),
    /** As typed by the guest. Never presented as a verified identity. */
    name: text('name').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [
    index('decisions_asset_idx').on(t.assetId, t.createdAt),
    index('decisions_review_idx').on(t.reviewId)
  ]
);

/** The Inbox: new guest comments and decisions. Read state is per member. */
export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    assetId: text('asset_id').references(() => assets.id, {
      onDelete: 'cascade'
    }),
    versionNumber: integer('version_number'),
    commentId: text('comment_id').references(() => comments.id, {
      onDelete: 'cascade'
    }),
    kind: text('kind', {
      enum: ['guest_comment', 'decision', 'feedback']
    }).notNull(),
    decision: text('decision', { enum: ['approved', 'changes_requested'] }),
    actorName: text('actor_name').notNull(),
    excerpt: text('excerpt').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('activity_workspace_idx').on(t.workspaceId, t.createdAt)]
);

export const activityReads = sqliteTable(
  'activity_reads',
  {
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    readAt: ms('read_at').notNull()
  },
  (t) => [primaryKey({ columns: [t.activityId, t.userId] })]
);

/** Fixed-window counters for rate limits and daily email budgets. */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull()
});

/** "At most once per hour" email throttles. */
export const emailThrottles = sqliteTable('email_throttles', {
  key: text('key').primaryKey(),
  lastSentAt: integer('last_sent_at').notNull()
});

export const emailLog = sqliteTable(
  'email_log',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reviewId: text('review_id').references(() => reviews.id, {
      onDelete: 'cascade'
    }),
    kind: text('kind').notNull(),
    recipient: text('recipient').notNull(),
    status: text('status').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('email_log_workspace_idx').on(t.workspaceId, t.createdAt)]
);

/** "Report this page" submissions. Admins review these in the Database page. */
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    reviewId: text('review_id').references(() => reviews.id, {
      onDelete: 'set null'
    }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null'
    }),
    token: text('token').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull(),
    createdAt: ms('created_at').notNull()
  },
  (t) => [index('reports_created_idx').on(t.createdAt)]
);

/** Generated signing key, used when BETTER_AUTH_SECRET is not set. */
export const appSecrets = sqliteTable('app_secrets', {
  name: text('name').primaryKey(),
  value: text('value').notNull()
});
