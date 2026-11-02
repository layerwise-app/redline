import { Link, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { resetStore } from '~/client/demo';
import { Button } from '~/components/ui/button';

/** Always visible in Try mode, so nobody mistakes sample data for the real thing. */
export function TryBanner({
  view
}: {
  view?: { reviewId: string; current: 'team' | 'guest' };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <div
      data-testid='try-banner'
      className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-wash px-2 py-1 text-xs sm:gap-x-3 sm:px-3'
    >
      <span className='font-medium'>Try mode</span>
      <span className='text-ink-muted max-sm:hidden'>
        Sample data, stored only in this browser.
      </span>
      {view ? (
        <span className='flex items-center gap-1'>
          <Button
            asChild
            size='xs'
            variant={view.current === 'team' ? 'secondary' : 'ghost'}
            aria-current={view.current === 'team' ? 'page' : undefined}
          >
            <Link
              to='/try/reviews/$reviewId'
              params={{ reviewId: view.reviewId }}
              data-testid='try-team-view'
            >
              Team<span className='max-sm:hidden'> view</span>
            </Link>
          </Button>
          <Button
            asChild
            size='xs'
            variant={view.current === 'guest' ? 'secondary' : 'ghost'}
            aria-current={view.current === 'guest' ? 'page' : undefined}
          >
            <Link
              to='/try/guest/$reviewId'
              params={{ reviewId: view.reviewId }}
              data-testid='try-guest-view'
            >
              Client<span className='max-sm:hidden'> view</span>
            </Link>
          </Button>
        </span>
      ) : null}
      <span className='ml-auto flex items-center gap-1'>
        <Button
          size='xs'
          variant='ghost'
          data-testid='try-reset'
          onClick={async () => {
            resetStore();
            queryClient.clear();
            await router.invalidate();
            window.location.reload();
          }}
        >
          Reset
        </Button>
        <Button asChild size='xs'>
          <Link to='/sign-up' search={{}} data-testid='try-sign-up'>
            <span className='sm:hidden'>Sign up</span>
            <span className='max-sm:hidden'>Create an account</span>
          </Link>
        </Button>
      </span>
    </div>
  );
}

export const TRY_OFF_MESSAGE =
  'Uploads and links are off in Try mode. Create an account to use your own files.';
