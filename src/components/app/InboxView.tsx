import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeamApi } from '~/client/api';
import { fullDate, timeAgo } from '~/client/format';
import type { InboxItem } from '~/domain/dto';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

const verb = (item: InboxItem) => {
  if (item.kind === 'decision') {
    return item.decision === 'approved' ? 'approved' : 'requested changes on';
  }
  if (item.kind === 'feedback') return 'sent feedback on';
  return 'commented on';
};

function search(item: InboxItem): string {
  if (item.commentId) return `?c=${item.commentId}`;
  if (item.assetId) return `?a=${item.assetId}`;
  return '';
}

export function InboxView({ api }: { api: TeamApi }) {
  const queryClient = useQueryClient();
  const queryKey = ['inbox', api.scope];
  const inbox = useQuery({ queryKey, queryFn: api.listInbox });
  const [onlyUnread, setOnlyUnread] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['reviews', api.scope] });
  };
  const markRead = useMutation({
    mutationFn: (ids: string[]) => api.markRead(ids),
    onSuccess: refresh
  });
  const markAll = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: refresh
  });
  const items = inbox.data?.items ?? [];
  const shown = onlyUnread ? items.filter((item) => item.unread) : items;

  return (
    <div data-testid='inbox' className='max-w-3xl'>
      <div className='mb-4 flex flex-wrap items-center gap-3'>
        <h1 className='text-xl font-semibold tracking-tight'>Inbox</h1>
        <div className='ml-auto flex items-center gap-2'>
          <label className='flex items-center gap-1.5 text-sm'>
            <input
              type='checkbox'
              data-testid='only-unread'
              checked={onlyUnread}
              onChange={(event) => setOnlyUnread(event.target.checked)}
            />
            Unread only
          </label>
          <Button
            variant='outline'
            size='sm'
            data-testid='mark-all-read'
            disabled={!inbox.data?.unread}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        </div>
      </div>
      {inbox.isSuccess && shown.length === 0 ? (
        <p className='py-12 text-center text-ink-muted'>
          {items.length
            ? 'You’re all caught up.'
            : 'New guest comments and decisions will show up here.'}
        </p>
      ) : null}
      {shown.length ? (
        <ul className='divide-y border-y'>
          {shown.map((item) => (
            <li
              key={item.id}
              data-testid='inbox-item'
              data-unread={item.unread}
              className={cn('relative flex gap-3 px-1 py-2.5 hover:bg-wash')}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  item.unread ? 'bg-ink' : 'bg-transparent'
                )}
              />
              <div className='min-w-0 flex-1'>
                <p className={cn(item.unread && 'font-medium')}>
                  <Link
                    to={`${api.paths.review(item.reviewId)}${search(item)}` as never}
                    data-testid='inbox-link'
                    className='rounded-sm after:absolute after:inset-0 hover:underline'
                    onClick={() => {
                      if (item.unread) markRead.mutate([item.id]);
                    }}
                  >
                    {item.actorName} {verb(item)} {item.reviewName}
                  </Link>
                  {item.unread ? <span className='sr-only'> (unread)</span> : null}
                </p>
                <p className='line-clamp-2 text-ink-muted'>{item.excerpt}</p>
                <p className='rl-num mt-0.5 text-xs text-ink-muted'>
                  {item.clientName}
                  {item.assetName ? ` · ${item.assetName}` : ''}
                  {item.versionNumber ? ` · V${item.versionNumber}` : ''}
                </p>
              </div>
              <time
                dateTime={item.createdAt}
                title={fullDate(item.createdAt)}
                suppressHydrationWarning
                className='rl-num shrink-0 text-xs whitespace-nowrap text-ink-muted'
              >
                {timeAgo(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length ? (
        <p className='mt-3 text-xs text-ink-muted'>
          Names are as guests entered them, not verified.
        </p>
      ) : null}
    </div>
  );
}
