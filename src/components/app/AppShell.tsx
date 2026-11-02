import type { ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import type { TeamApi } from '~/client/api';
import { signOut } from '~/lib/auth-client';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';
import { LogoMark, Wordmark } from './Logo';

const INBOX_POLL_MS = 60_000;

/** Top bar shared by the real app and Try mode. */
export function AppShell({
  api,
  banner,
  children
}: {
  api: TeamApi;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const shell = useQuery({
    queryKey: ['shell', api.scope],
    queryFn: api.getShell
  });
  const inbox = useQuery({
    queryKey: ['inbox', api.scope],
    queryFn: api.listInbox,
    refetchInterval: api.scope === 'server' ? INBOX_POLL_MS : false
  });
  const active = shell.data?.workspaces.find((w) => w.active);
  const unread = inbox.data?.unread ?? 0;

  const nav = [
    { to: api.paths.reviews, label: 'Reviews', exact: true },
    { to: api.paths.inbox, label: 'Inbox', count: unread },
    { to: api.paths.settings, label: 'Settings' }
  ];

  return (
    <div className='flex min-h-dvh flex-col bg-paper'>
      {banner}
      <header className='border-b'>
        <div className='mx-auto flex h-12 max-w-[1320px] items-center gap-1 px-3 sm:gap-4 sm:px-5'>
          <Link
            to={api.paths.reviews as never}
            className='shrink-0 rounded-sm'
            aria-label='Reviews'
          >
            <span className='max-sm:hidden'>
              <Wordmark />
            </span>
            <span className='flex sm:hidden'>
              <LogoMark size={24} />
            </span>
          </Link>
          <nav aria-label='Main' className='flex items-center gap-0.5 max-sm:ml-1 sm:ml-3'>
            {nav.map((item) => {
              const current = item.exact
                ? pathname === item.to || pathname === `${item.to}/`
                : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
                  aria-current={current ? 'page' : undefined}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded px-2 text-sm max-sm:px-1.5',
                    current
                      ? 'bg-wash font-medium'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {item.label}
                  {item.count ? (
                    <span
                      data-testid='nav-unread'
                      className='rl-num rounded-sm bg-ink px-1 text-[11px] leading-4 text-white'
                    >
                      {item.count}
                      <span className='sr-only'> unread</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className='ml-auto flex min-w-0 items-center'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='sm' className='min-w-0 max-sm:px-1' data-testid='account-menu'>
                  <span className='max-w-36 truncate max-sm:max-w-20'>{active?.name ?? ''}</span>
                  <ChevronDown aria-hidden className='size-3.5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='min-w-56'>
                <DropdownMenuLabel className='font-normal'>
                  <span className='block font-medium'>{shell.data?.user.name}</span>
                  <span className='block text-xs text-ink-muted'>{shell.data?.user.email}</span>
                </DropdownMenuLabel>
                {api.switchWorkspace && (shell.data?.workspaces.length ?? 0) > 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className='text-xs font-normal text-ink-muted'>
                      Workspaces
                    </DropdownMenuLabel>
                    {shell.data?.workspaces.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.id}
                        data-testid='switch-workspace'
                        onSelect={async () => {
                          await api.switchWorkspace!(workspace.id);
                          await queryClient.invalidateQueries();
                          await navigate({ to: api.paths.reviews as never });
                        }}
                      >
                        <span className={workspace.active ? 'font-medium' : ''}>{workspace.name}</span>
                        {workspace.active ? (
                          <span className='ml-auto text-xs text-ink-muted'>Current</span>
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                {api.scope === 'server' ? (
                  <DropdownMenuItem
                    data-testid='sign-out'
                    onSelect={async () => {
                      await signOut();
                      queryClient.clear();
                      await navigate({ to: '/' });
                    }}
                  >
                    Sign out
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => navigate({ to: '/' })}>
                    Leave Try mode
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className='mx-auto w-full max-w-[1320px] flex-1 px-3 py-5 sm:px-5 sm:py-7'>
        {children}
      </main>
    </div>
  );
}
