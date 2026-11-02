import { useMemo } from 'react';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { teamReviewApi } from '~/client/server-api';
import { ReviewScreen } from '~/components/review/ReviewScreen';
import { EmptyReviewDrop, TeamTools } from '~/components/review/TeamTools';
import { Button } from '~/components/ui/button';
import { teamSnapshotFn } from '~/server/team.functions';
import { focusSearch } from '~/lib/focus-search';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/reviews/$reviewId')({
  validateSearch: focusSearch,
  loader: async ({ params }) => {
    try {
      return await teamSnapshotFn({ data: { reviewId: params.reviewId } });
    } catch (error) {
      // Other workspaces' reviews are indistinguishable from missing ones.
      if (error instanceof Error && error.message === 'Not found.') throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) =>
    seo({ title: `${loaderData?.name ?? 'Review'} · Redline`, noindex: true }),
  component: ReviewPage
});

function ReviewPage() {
  const initial = Route.useLoaderData();
  const { reviewId } = Route.useParams();
  const search = Route.useSearch();
  const api = useMemo(() => teamReviewApi(reviewId), [reviewId]);
  return (
    <div className='h-dvh'>
      <ReviewScreen
        api={api}
        initial={initial}
        draftScope={`team:${reviewId}`}
        focusComment={search.c}
        focusAsset={search.a}
        back={
          <Button variant='ghost' size='icon-sm' asChild>
            <Link to='/dashboard' aria-label='Back to reviews' data-testid='back'>
              <ChevronLeft aria-hidden className='size-4' />
            </Link>
          </Button>
        }
        teamTools={(context) => <TeamTools context={context} />}
        emptySlot={(context) => <EmptyReviewDrop context={context} />}
      />
    </div>
  );
}
