import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { demoReviewApi } from '~/client/demo';
import { focusSearch } from '~/lib/focus-search';
import { TRY_OFF_MESSAGE, TryBanner } from '~/components/app/TryBanner';
import { ReviewScreen } from '~/components/review/ReviewScreen';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/try/reviews/$reviewId')({
  validateSearch: focusSearch,
  component: TryReview
});

function TryReview() {
  const { reviewId } = Route.useParams();
  const search = Route.useSearch();
  const api = useMemo(() => demoReviewApi(reviewId, 'team'), [reviewId]);
  return (
    <div className='flex h-dvh flex-col'>
      <TryBanner view={{ reviewId, current: 'team' }} />
      <div className='min-h-0 flex-1'>
        <ReviewScreen
          key={`team-${reviewId}`}
          api={api}
          draftScope={`try-team:${reviewId}`}
          focusComment={search.c}
          focusAsset={search.a}
          back={
            <Button variant='ghost' size='icon-sm' asChild>
              <Link to='/try' aria-label='Back to reviews' data-testid='back'>
                <ChevronLeft aria-hidden className='size-4' />
              </Link>
            </Button>
          }
          teamTools={() => (
            <>
              <Button
                size='sm'
                variant='outline'
                data-testid='try-upload'
                onClick={() => toast(TRY_OFF_MESSAGE)}
              >
                Upload
              </Button>
              <Button size='sm' data-testid='try-share' onClick={() => toast(TRY_OFF_MESSAGE)}>
                Share
              </Button>
            </>
          )}
          emptySlot={() => (
            <div className='flex h-full items-center justify-center bg-wash p-6 text-center text-ink-muted'>
              {TRY_OFF_MESSAGE}
            </div>
          )}
        />
      </div>
    </div>
  );
}
