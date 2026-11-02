import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { landingReviewApi, landingSnapshot } from '~/client/demo';
import { Wordmark } from '~/components/app/Logo';
import { ReviewScreen } from '~/components/review/ReviewScreen';
import { Button } from '~/components/ui/button';
import { redline } from '~/redline.config';
import { site, siteUrl } from '~/lib/site';
import { seo } from '~/utils/seo';

const TITLE = 'Redline: design review your clients will actually use';
const DESCRIPTION =
  'Upload mockups and send a link. Clients drop pins and approve a specific version, with no account.';

export const Route = createFileRoute('/')({
  head: () =>
    seo({
      title: TITLE,
      description: DESCRIPTION,
      path: '/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: siteUrl('/')
      }
    }),
  loader: () => landingSnapshot(),
  component: Home
});

const STEPS: [string, string][] = [
  [
    'Upload your mockups',
    'JPG, PNG, WebP, or PDF. Each PDF page becomes a page to pin on, and originals stay ready to download.'
  ],
  [
    'Send one link',
    'No client account. Add a password or an expiry if you want one, and revoke it whenever you like.'
  ],
  [
    'Get pins, not paragraphs',
    'Clients click the exact spot. Pins stay put at every zoom and screen size, and comments list beside the design.'
  ],
  [
    'Approve a specific version',
    'Each decision records the name given, the time, and the version. A new version goes back to In review and keeps the history.'
  ],
  [
    'Talk privately on the same pin',
    'Mark a comment Internal and it stays with your team. Clients never receive it, in the page or in its data.'
  ],
  [
    'Compare what changed',
    'Line up any two versions side by side or with a slider, and carry open comments forward when you upload.'
  ]
];

function Home() {
  const initial = Route.useLoaderData();
  const api = useMemo(() => landingReviewApi(), []);
  return (
    <div className='flex min-h-dvh flex-col bg-paper'>
      <header className='border-b'>
        <div className='mx-auto flex h-12 max-w-[1320px] items-center gap-2 px-3 sm:px-5'>
          <Wordmark />
          <nav aria-label='Account' className='ml-auto flex items-center gap-1'>
            <Button asChild variant='ghost' size='sm'>
              <Link to='/sign-in' search={{}}>
                Sign in
              </Link>
            </Button>
            <Button asChild size='sm'>
              <Link to='/try' data-testid='try-redline'>
                Try Redline
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className='flex-1'>
        <div className='mx-auto flex max-w-[1320px] flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3 pt-5 pb-4 sm:px-5 sm:pt-7'>
          <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
            Click the design. Say what should change.
          </h1>
          <p className='text-ink-muted'>
            This is the real canvas. Drop a pin anywhere on the mockup below.
          </p>
        </div>

        <div className='mx-auto max-w-[1320px] sm:px-5'>
          <div
            data-testid='landing-canvas'
            className='h-[72dvh] min-h-[440px] overflow-hidden border-y sm:rounded sm:border'
          >
            <ReviewScreen
              api={api}
              initial={initial}
              embedded
              draftScope='landing'
              title={
                <p className='truncate text-xs text-ink-muted'>
                  Sample: {initial.brand.name} for {initial.clientName}
                </p>
              }
            />
          </div>
        </div>

        <section aria-labelledby='how' className='mx-auto max-w-[1320px] px-3 py-12 sm:px-5 sm:py-16'>
          <h2 id='how' className='mb-6 text-xl font-semibold tracking-tight'>
            Built for freelance designers and small studios
          </h2>
          <dl className='grid border-t sm:grid-cols-2 sm:gap-x-10'>
            {STEPS.map(([title, body]) => (
              <div key={title} className='border-b py-4'>
                <dt className='font-medium'>{title}</dt>
                <dd className='mt-1 max-w-prose text-ink-muted'>{body}</dd>
              </div>
            ))}
          </dl>
          <div className='mt-8 flex flex-wrap items-center gap-2'>
            <Button asChild>
              <Link to='/try'>Try Redline</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link to='/sign-up' search={{}}>
                Create an account
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className='border-t'>
        <div className='mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-3 py-4 text-xs text-ink-muted sm:px-5'>
          <span>{redline.product.name}</span>
          <span>All people and brands in the sample are fictional.</span>
        </div>
      </footer>
    </div>
  );
}
