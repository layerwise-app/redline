/**
 * The shapes the browser receives. Guests and the team share them, and the guest
 * serializers fill them from whitelists, so nothing reaches a guest by default.
 * Types only: safe to import from anywhere.
 */
export type AssetStatus = 'in_review' | 'changes_requested' | 'approved';
export type ReviewStatus = 'empty' | AssetStatus;
export type DecisionKind = 'approved' | 'changes_requested';
export type VersionKind = 'image' | 'pdf';
export type WorkspaceRole = 'owner' | 'member';

export type PageDTO = {
  id: string;
  number: number;
  width: number;
  height: number;
  url: string;
};

export type VersionDTO = {
  id: string;
  number: number;
  kind: VersionKind;
  originalName: string;
  originalSize: number;
  pageCount: number;
  createdAt: string;
  createdByName: string;
  /** Null when downloads are off for this viewer. */
  downloadUrl: string | null;
  /** When a team member last clicked "Notify clients". Team view only. */
  notifiedAt: string | null;
  pages: PageDTO[];
};

export type DecisionDTO = {
  id: string;
  assetId: string;
  versionId: string;
  versionNumber: number;
  decision: DecisionKind;
  /** The name the guest typed. Never presented as verified. */
  name: string;
  createdAt: string;
};

export type AssetDTO = {
  id: string;
  name: string;
  status: AssetStatus;
  currentVersionId: string;
  versions: VersionDTO[];
  decisions: DecisionDTO[];
};

export type CommentDTO = {
  id: string;
  assetId: string;
  versionId: string;
  pageNumber: number;
  /** Null for a top-level pin; a thread id for a reply. */
  parentId: string | null;
  /** Numbered separately for client-visible and internal pins. Null on replies. */
  pin: number | null;
  /** Page-relative, 0 to 1. Null on replies. */
  x: number | null;
  y: number | null;
  body: string;
  authorName: string;
  authorKind: 'team' | 'guest';
  /** Always false in guest payloads, which never contain internal comments. */
  internal: boolean;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /** Set when copied forward: the version number this came from. */
  fromVersion: number | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  /** Whether this viewer wrote it and may edit or delete it. */
  canEdit: boolean;
  /** Guests delete only their own; the team can also remove any comment. */
  canDelete: boolean;
  /** Team view only: where a reply to this guest would be emailed. */
  guestEmail?: string | null;
};

export type WorkspaceBrand = {
  name: string;
  accentColor: string;
  logoUrl: string | null;
};

export type GuestIdentity = {
  name: string;
  email: string | null;
};

export type ReviewSnapshot = {
  viewer: 'team' | 'guest';
  reviewId: string;
  name: string;
  clientName: string;
  status: ReviewStatus;
  brand: WorkspaceBrand;
  allowDownloads: boolean;
  assets: AssetDTO[];
  comments: CommentDTO[];
  /** Guest view: who this browser is, once they have given a name. */
  guest: GuestIdentity | null;
};

export type ReviewRow = {
  id: string;
  name: string;
  clientName: string;
  status: ReviewStatus;
  openComments: number;
  unread: number;
  lastActivityAt: string;
  assetCount: number;
};

export type InboxItem = {
  id: string;
  kind: 'guest_comment' | 'decision' | 'feedback';
  reviewId: string;
  reviewName: string;
  clientName: string;
  assetId: string | null;
  assetName: string | null;
  versionNumber: number | null;
  commentId: string | null;
  decision: DecisionKind | null;
  actorName: string;
  excerpt: string;
  createdAt: string;
  unread: boolean;
};

export type MemberDTO = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
  isYou: boolean;
};

export type InviteDTO = {
  id: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  active: boolean;
};

export type WorkspaceSettings = {
  id: string;
  name: string;
  accentColor: string;
  logoUrl: string | null;
  role: WorkspaceRole;
  members: MemberDTO[];
  invites: InviteDTO[];
  usedBytes: number;
  limitBytes: number;
  maxFileBytes: number;
  /** True when project Storage is read-only: new uploads will fail. */
  storageReadOnly: boolean;
};
