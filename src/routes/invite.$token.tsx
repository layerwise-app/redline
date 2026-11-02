import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '~/components/ui/button';
import { Wordmark } from '~/components/app/Logo';
import { getAuthSession } from '~/lib/auth.functions';
import { previewInviteFn } from '~/server/guest.functions';
import { acceptInviteFn } from '~/server/team.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ params }) => {
    const [invite, session] = await Promise.all([
      previewInviteFn({ data: { token: params.token } }),
      getAuthSession()
    ]);
    return { invite, user: session?.user ?? null };
  },
  head: () => seo({ title: 'Join a workspace · Redline', noindex: true }),
  component: InvitePage
});

function InvitePage() {
  const { invite, user } = Route.useLoaderData();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => acceptInviteFn({ data: { token } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: '/dashboard' });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : 'That didn’t work.')
  });
  const here = `/invite/${token}`;

  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper p-6 text-center'>
      <Wordmark />
      {invite.state === 'valid' ? (
        <div className='max-w-sm space-y-3' data-testid='invite-valid'>
          <h1 className='text-lg font-semibold'>Join {invite.workspaceName}</h1>
          {invite.email ? (
            <p className='text-ink-muted'>This invitation is for {invite.email}.</p>
          ) : null}
          {user ? (
            <>
              <p className='text-ink-muted'>Signed in as {user.email}.</p>
              <Button data-testid='accept-invite' disabled={accept.isPending} onClick={() => accept.mutate()}>
                {accept.isPending ? 'Joining…' : 'Accept invitation'}
              </Button>
            </>
          ) : (
            <div className='flex justify-center gap-2'>
              <Button asChild>
                <Link to='/sign-up' search={{ redirect: here }} data-testid='invite-sign-up'>
                  Create an account
                </Link>
              </Button>
              <Button asChild variant='outline'>
                <Link to='/sign-in' search={{ redirect: here }}>
                  Sign in
                </Link>
              </Button>
            </div>
          )}
          {error ? (
            <p role='alert' data-testid='invite-error' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className='max-w-sm space-y-2' data-testid='invite-unavailable'>
          <h1 className='text-lg font-semibold'>This invitation isn’t available</h1>
          <p className='text-ink-muted'>
            It may have expired, been revoked, or already been used. Ask for a new one.
          </p>
        </div>
      )}
    </main>
  );
}
