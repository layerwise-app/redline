import { useMemo, useState } from 'react';
import {
  createFileRoute,
  useRouter
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { guestReviewApi, LinkClosedError } from '~/client/server-api';
import { ReportDialog } from '~/components/review/GuestDialogs';
import { ReviewScreen } from '~/components/review/ReviewScreen';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { readableOn } from '~/lib/redline/color';
import { guestLoadFn, reportFn, unlockFn } from '~/server/guest.functions';
import { focusSearch } from '~/lib/focus-search';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/r/$token')({
  validateSearch: focusSearch,
  loader: ({ params }) => guestLoadFn({ data: { token: params.token } }),
  head: () => {
    const head = seo({ title: 'Design review', noindex: true });
    return {
      ...head,
      // The link is the credential, so it shouldn't leak through referrers.
      meta: [...head.meta, { name: 'referrer', content: 'no-referrer' }]
    };
  },
  component: GuestPage
});

function ReportLink({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type='button'
        data-testid='report-page'
        className='rounded-sm text-xs text-ink-muted hover:text-ink hover:underline'
        onClick={() => setOpen(true)}
      >
        Report this page
      </button>
      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(input) => reportFn({ data: { ...input, token } })}
      />
    </>
  );
}

function Closed({
  token,
  title,
  body
}: {
  token: string;
  title: string;
  body: string;
}) {
  return (
    <main
      data-testid='link-closed'
      className='flex min-h-dvh flex-col items-center justify-center gap-2 bg-paper p-6 text-center'
    >
      <h1 className='text-lg font-semibold'>{title}</h1>
      <p className='max-w-sm text-ink-muted'>{body}</p>
      <div className='mt-6'>
        <ReportLink token={token} />
      </div>
    </main>
  );
}

const CLOSED_TEXT = {
  unavailable: {
    title: 'This link isn’t available',
    body: 'It may have been revoked or replaced. Ask the team who shared it for a new one.'
  },
  expired: {
    title: 'This link has expired',
    body: 'Ask the team who shared it for a new one.'
  }
};

function Locked({ token, workspaceName }: { token: string; workspaceName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main data-testid='link-locked' className='flex min-h-dvh flex-col items-center justify-center bg-paper p-6'>
      <form
        className='w-full max-w-xs space-y-3'
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const result = await unlockFn({ data: { token, password } });
            if (result.ok) await router.invalidate();
            else setError(result.message);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'That didn’t work.');
          } finally {
            setBusy(false);
            setPassword('');
          }
        }}
      >
        <h1 className='text-lg font-semibold'>{workspaceName} shared a review</h1>
        <div className='space-y-1.5'>
          <Label htmlFor='review-password'>Password</Label>
          <Input
            id='review-password'
            data-testid='unlock-password'
            type='password'
            required
            autoFocus
            autoComplete='off'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error ? (
          <p role='alert' data-testid='unlock-error' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <Button type='submit' className='w-full' data-testid='unlock-submit' disabled={busy}>
          {busy ? 'Checking…' : 'Open the review'}
        </Button>
      </form>
      <div className='mt-6'>
        <ReportLink token={token} />
      </div>
    </main>
  );
}

function GuestPage() {
  const load = Route.useLoaderData();
  const { token } = Route.useParams();
  const search = Route.useSearch();
  const api = useMemo(() => guestReviewApi(token), [token]);

  if (load.state === 'unavailable') return <Closed token={token} {...CLOSED_TEXT.unavailable} />;
  if (load.state === 'expired') return <Closed token={token} {...CLOSED_TEXT.expired} />;
  if (load.state === 'locked') {
    return <Locked token={token} workspaceName={load.workspaceName} />;
  }

  const { snapshot } = load;
  return (
    <GuestReview
      api={api}
      initial={snapshot}
      token={token}
      focusComment={search.c}
      focusAsset={search.a}
    />
  );
}

function GuestReview({
  api,
  initial,
  token,
  focusComment,
  focusAsset
}: {
  api: ReturnType<typeof guestReviewApi>;
  initial: Parameters<typeof ReviewScreen>[0]['initial'];
  token: string;
  focusComment?: string;
  focusAsset?: string;
}) {
  // If the team closes the link while this page is open, stop showing the design.
  const closed = useQuery({
    queryKey: api.queryKey,
    queryFn: api.load,
    initialData: initial,
    retry: (count, error) => !(error instanceof LinkClosedError) && count < 2
  });
  if (closed.error instanceof LinkClosedError) {
    const state = closed.error.message;
    if (state === 'locked') return <LockedReload token={token} />;
    return (
      <Closed
        token={token}
        {...(state === 'expired' ? CLOSED_TEXT.expired : CLOSED_TEXT.unavailable)}
      />
    );
  }
  const brand = closed.data?.brand ?? initial?.brand;
  return (
    <div className='h-dvh'>
      <ReviewScreen
        api={api}
        initial={initial}
        draftScope={`guest:${token}`}
        focusComment={focusComment}
        focusAsset={focusAsset}
        back={
          brand ? (
            <div className='flex items-center gap-2 pl-1' data-testid='workspace-brand'>
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt=''
                  data-testid='guest-logo'
                  className='size-6 rounded-sm object-contain'
                />
              ) : (
                <span
                  aria-hidden
                  className='flex size-6 items-center justify-center rounded-sm text-xs font-semibold'
                  style={{
                    background: brand.accentColor,
                    color: readableOn(brand.accentColor)
                  }}
                >
                  {brand.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className='max-w-32 truncate text-sm font-medium max-sm:hidden'>
                {brand.name}
              </span>
              <span aria-hidden className='h-4 w-px bg-line max-sm:hidden' />
            </div>
          ) : null
        }
      />
    </div>
  );
}

function LockedReload({ token }: { token: string }) {
  return (
    <Closed
      token={token}
      title='This review now needs a password'
      body='The team added a password since you opened this page. Reload to enter it.'
    />
  );
}
