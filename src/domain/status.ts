import type { AssetStatus, DecisionKind, ReviewStatus } from './dto';

type DecisionLike = {
  versionId: string;
  decision: DecisionKind;
  createdAt: Date | string | number;
};

const time = (value: Date | string | number) => new Date(value).getTime();

/**
 * Only decisions on the current version count, so a new version puts an asset
 * back In review while its earlier decisions stay in the history.
 */
export function assetStatus(
  currentVersionId: string | null,
  decisions: readonly DecisionLike[]
): AssetStatus {
  let latest: DecisionLike | null = null;
  for (const decision of decisions) {
    if (decision.versionId !== currentVersionId) continue;
    if (!latest || time(decision.createdAt) >= time(latest.createdAt)) {
      latest = decision;
    }
  }
  return latest ? latest.decision : 'in_review';
}

/** A review is Approved only when every asset is. */
export function reviewStatus(assets: readonly AssetStatus[]): ReviewStatus {
  if (assets.length === 0) return 'empty';
  if (assets.every((status) => status === 'approved')) return 'approved';
  if (assets.includes('changes_requested')) return 'changes_requested';
  return 'in_review';
}

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  empty: 'No files yet',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved'
};
