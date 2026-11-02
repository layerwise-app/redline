/**
 * Everything product-level lives here: name, colors, fonts, limits and rate
 * limits. Server code enforces the limits; the UI only reads them for messages.
 */
const MB = 1024 * 1024;
const GB = 1024 * MB;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const redline = {
  product: {
    name: 'Redline',
    description:
      'Design review for freelance designers and small studios. Upload mockups, send a link, and get pinned feedback and approvals with no client account.'
  },

  colors: {
    /** The one accent. Used for pins and nothing decorative. */
    accent: '#D92D20',
    ink: '#16171A',
    inkMuted: '#5C5F66',
    line: '#E3E3E0',
    paper: '#FFFFFF',
    wash: '#F6F6F4',
    /** Internal comments only: unmistakably not the client-facing accent. */
    internal: '#7A4B00',
    internalWash: '#FFF4D6',
    internalLine: '#B7791F',
    canvasLight: '#ECECE9',
    canvasDark: '#1B1C1F'
  },

  fonts: {
    ui: "'Instrument Sans Variable', 'Helvetica Neue', Arial, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace"
  },

  limits: {
    maxFileBytes: 100 * MB,
    maxPdfPages: 50,
    workspaceStorageBytes: 2 * GB,
    previewMaxWidth: 2880,
    previewMaxBytes: 25 * MB,
    logoMaxBytes: 2 * MB,
    commentMaxLength: 2000,
    reviewNameMaxLength: 120,
    clientNameMaxLength: 120,
    guestNameMaxLength: 80,
    workspaceNameMaxLength: 80,
    reportMaxLength: 2000,
    maxRecipientsPerReview: 20,
    inviteLifetimeMs: 7 * DAY
  },

  rateLimits: {
    /** Password attempts for one review link, per client address. */
    passwordTries: { limit: 5, windowMs: 15 * MINUTE },
    /** Backstop across all addresses, so rotating IPs can't brute force a link. */
    passwordTriesPerLink: { limit: 30, windowMs: 15 * MINUTE },
    guestComments: { limit: 12, windowMs: MINUTE },
    guestCommentsHourly: { limit: 120, windowMs: HOUR },
    guestDecisions: { limit: 12, windowMs: HOUR },
    guestFeedback: { limit: 3, windowMs: HOUR },
    guestIdentity: { limit: 12, windowMs: HOUR },
    reports: { limit: 5, windowMs: HOUR }
  },

  email: {
    /** Client email (share, reply, new version) per workspace per UTC day. */
    clientEmailsPerWorkspacePerDay: 50,
    /** Teammate invitations per workspace per UTC day. */
    inviteEmailsPerWorkspacePerDay: 20,
    /** Guest actions that email the creator, per review per UTC day. */
    creatorEmailsPerReviewPerDay: 20,
    replyThrottleMs: HOUR,
    firstCommentThrottleMs: HOUR
  },

  canvas: {
    pollMs: 15_000,
    minZoom: 0.05,
    maxZoom: 8
  }
} as const;

export type RedlineConfig = typeof redline;
