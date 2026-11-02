import type {
  DecisionKind,
  InboxItem,
  ReviewRow,
  ReviewSnapshot,
  WorkspaceSettings,
  WorkspaceSummary
} from '~/domain/dto';

export type NewPinInput = {
  versionId: string;
  pageNumber: number;
  x: number;
  y: number;
  body: string;
  internal: boolean;
};

/**
 * What the review canvas needs. The server implements it for the team and for
 * guests, and browser storage implements it for Try mode and the landing page.
 */
export type ReviewApi = {
  queryKey: readonly unknown[];
  /** Poll for new activity. Off for data that lives only in this browser. */
  poll: boolean;
  /** Guests must give a name before their first comment or decision. */
  identity: 'required' | 'none';
  load(): Promise<ReviewSnapshot>;
  addPin(input: NewPinInput): Promise<unknown>;
  reply(input: {
    parentId: string;
    body: string;
    internal: boolean;
  }): Promise<{ notices?: string[] } | unknown>;
  edit(input: { id: string; body: string }): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  setResolved(input: { id: string; resolved: boolean }): Promise<unknown>;
  setIdentity?(input: { name: string; email: string | null }): Promise<unknown>;
  decide?(input: {
    assetId: string;
    versionId: string;
    decision: DecisionKind;
  }): Promise<unknown>;
  sendFeedback?(): Promise<{ sent: boolean; count: number }>;
  report?(input: { reason: string; details: string }): Promise<unknown>;
};

export type ShellData = {
  user: { id: string; name: string; email: string };
  workspaces: WorkspaceSummary[];
  activeId: string;
};

/** Everything around the canvas: lists, Inbox, settings. Same idea as ReviewApi. */
export type TeamApi = {
  scope: 'server' | 'try';
  paths: {
    reviews: string;
    inbox: string;
    settings: string;
    review: (id: string) => string;
  };
  getShell(): Promise<ShellData>;
  switchWorkspace?(workspaceId: string): Promise<unknown>;
  listReviews(): Promise<ReviewRow[]>;
  createReview(input: { name: string; clientName: string }): Promise<{ id: string }>;
  listInbox(): Promise<{ items: InboxItem[]; unread: number }>;
  markRead(ids: string[]): Promise<unknown>;
  markAllRead(): Promise<unknown>;
  getSettings(): Promise<WorkspaceSettings>;
  updateWorkspace(input: {
    workspaceId: string;
    name: string;
    accentColor: string;
  }): Promise<unknown>;
};
