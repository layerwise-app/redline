import type { DecisionKind, VersionKind } from '~/domain/dto';

/**
 * Sample content for the landing page and Try mode. Times are minutes before
 * "now" so the data always reads as recent. Coordinates are page-relative 0-1.
 */
export type SamplePerson = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
};

export type SampleComment = {
  id: string;
  /** Top-level comments have a pin position; replies set parentId instead. */
  pageNumber: number;
  parentId?: string;
  x?: number;
  y?: number;
  body: string;
  authorName: string;
  authorKind: 'team' | 'guest';
  internal?: boolean;
  resolvedMinutesAgo?: number;
  resolvedByName?: string;
  /** Copied-forward comments set the version they came from. */
  fromVersion?: number;
  minutesAgo: number;
};

export type SampleVersion = {
  id: string;
  number: number;
  kind: VersionKind;
  originalName: string;
  originalSize: number;
  createdByName: string;
  minutesAgo: number;
  /** Public paths under /samples and real pixel sizes. */
  pages: { src: string; width: number; height: number }[];
  comments: SampleComment[];
};

export type SampleDecision = {
  id: string;
  versionNumber: number;
  decision: DecisionKind;
  name: string;
  minutesAgo: number;
};

export type SampleAsset = {
  id: string;
  name: string;
  versions: SampleVersion[];
  decisions: SampleDecision[];
};

export type SampleReview = {
  id: string;
  name: string;
  clientName: string;
  recipients: string[];
  assets: SampleAsset[];
};

export type SampleData = {
  studio: {
    name: string;
    accentColor: string;
    /** Public path, a real logo for the fictional studio. */
    logoSrc: string;
  };
  /** Index 0 is the person you act as in Try mode's team view. */
  members: SamplePerson[];
  /** The client name you act as in Try mode's guest view. */
  guestName: string;
  reviews: SampleReview[];
};
