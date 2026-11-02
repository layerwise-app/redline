import { Check } from 'lucide-react';
import type { ReviewStatus } from '~/domain/dto';
import { STATUS_LABELS } from '~/domain/status';

/** Status by shape, not color: the only color on the screen belongs to the pins. */
export function StatusMark({ status }: { status: ReviewStatus }) {
  const base = 'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full';
  if (status === 'approved') {
    return (
      <span aria-hidden className={`${base} bg-ink text-white`}>
        <Check className='size-2.5' strokeWidth={3} />
      </span>
    );
  }
  if (status === 'changes_requested') {
    return (
      <span aria-hidden className={`${base} border-[1.5px] border-ink`}>
        <span className='h-full w-1/2 self-stretch rounded-l-full bg-ink' style={{ marginRight: '50%' }} />
      </span>
    );
  }
  if (status === 'in_review') {
    return <span aria-hidden className={`${base} border-[1.5px] border-ink`} />;
  }
  return <span aria-hidden className={`${base} border-[1.5px] border-dashed border-ink-muted`} />;
}

export function StatusLabel({ status }: { status: ReviewStatus }) {
  return (
    <span className='inline-flex items-center gap-1.5 whitespace-nowrap' data-status={status}>
      <StatusMark status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}
