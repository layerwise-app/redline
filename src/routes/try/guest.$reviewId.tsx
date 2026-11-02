import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { demoReviewApi, readStore } from '~/client/demo';
import { TryBanner } from '~/components/app/TryBanner';
import { ReviewScreen } from '~/components/review/ReviewScreen';

export const Route = createFileRoute('/try/guest/$reviewId')({
  component: TryGuest
});

function TryGuest() {
  const { reviewId } = Route.useParams();
  const api = useMemo(() => demoReviewApi(reviewId, 'guest'), [reviewId]);
  const studio = useMemo(() => readStore().studio, []);
  return (
    <div className='flex h-dvh flex-col'>
      <TryBanner view={{ reviewId, current: 'guest' }} />
      <div className='min-h-0 flex-1'>
        <ReviewScreen
          key={`guest-${reviewId}`}
          api={api}
          draftScope={`try-guest:${reviewId}`}
          back={
            <div className='flex items-center gap-2 pl-1' data-testid='workspace-brand'>
              <img src={studio.logoUrl} alt='' className='size-6 rounded-sm object-contain' />
              <span className='max-w-32 truncate text-sm font-medium max-sm:hidden'>{studio.name}</span>
              <span aria-hidden className='h-4 w-px bg-line max-sm:hidden' />
            </div>
          }
        />
      </div>
    </div>
  );
}
