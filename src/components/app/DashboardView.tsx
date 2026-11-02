import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewRow, ReviewStatus } from '~/domain/dto';
import { STATUS_LABELS } from '~/domain/status';
import type { TeamApi } from '~/client/api';
import { fullDate, timeAgo } from '~/client/format';
import { redline } from '~/redline.config';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { StatusLabel } from '~/components/review/StatusMark';
import { toast } from 'sonner';
import { DropZone } from '~/components/review/UploadDialog';

const STATUSES: ReviewStatus[] = ['in_review', 'changes_requested', 'approved', 'empty'];

const fileToTitle = (name: string) =>
  name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();

function NewReviewDialog({
  api,
  open,
  files,
  onClose
}: {
  api: TeamApi;
  open: boolean;
  files: File[];
  onClose(): void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shown = name || (files[0] ? fileToTitle(files[0].name) : '');

  const create = useMutation({
    mutationFn: () => api.createReview({ name: shown, clientName }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['reviews', api.scope] });
      if (files.length && api.scope === 'server') {
        await startUploads(id);
      }
      await navigate({ to: api.paths.review(id) as never });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : 'That didn’t save.')
  });

  // The review exists by now, so an upload failure shows on the page we open next.
  const startUploads = async (id: string) => {
    const { uploadFile } = await import('~/client/upload');
    for (const file of files) {
      try {
        await uploadFile({
          file,
          reviewId: id,
          assetId: null,
          copyOpenComments: false,
          onProgress: (progress) => setUploadNote(`${file.name}: ${progress.detail}`)
        });
      } catch (cause) {
        toast.error(
          `${file.name}: ${cause instanceof Error ? cause.message : 'The upload failed.'}`,
          { duration: 12000 }
        );
      }
    }
  };
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !create.isPending && onClose()}>
      <DialogContent className='sm:max-w-md' data-testid='new-review-dialog'>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>New review</DialogTitle>
            <DialogDescription>
              {files.length
                ? `${files.length} ${files.length === 1 ? 'file' : 'files'} ready to upload.`
                : 'You can add files once it’s created.'}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='review-name'>Review name</Label>
            <Input
              id='review-name'
              required
              autoFocus
              data-testid='review-name'
              maxLength={redline.limits.reviewNameMaxLength}
              value={shown}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='client-name'>Client name</Label>
            <Input
              id='client-name'
              required
              data-testid='client-name'
              maxLength={redline.limits.clientNameMaxLength}
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
            />
          </div>
          {uploadNote ? <p className='text-xs text-ink-muted'>{uploadNote}</p> : null}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='submit' data-testid='create-review' disabled={create.isPending}>
              {create.isPending
                ? files.length
                  ? 'Uploading…'
                  : 'Creating…'
                : 'Create review'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardView({ api }: { api: TeamApi }) {
  const reviews = useQuery({
    queryKey: ['reviews', api.scope],
    queryFn: api.listReviews,
    refetchInterval: api.scope === 'server' ? redline.canvas.pollMs : false
  });
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const rows = reviews.data ?? [];
  const clients = useMemo(
    () => Array.from(new Set(rows.map((row) => row.clientName))).sort(),
    [rows]
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.clientName.toLowerCase().includes(needle)) &&
        (!client || row.clientName === client) &&
        (!status || row.status === status)
    );
  }, [rows, search, client, status]);

  const openNew = (dropped: File[] = []) => {
    setFiles(dropped);
    setNewOpen(true);
  };

  return (
    <div data-testid='dashboard'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <h1 className='text-xl font-semibold tracking-tight'>Reviews</h1>
        {rows.length ? (
          <Button data-testid='new-review' onClick={() => openNew()}>
            New review
          </Button>
        ) : null}
      </div>

      {reviews.isSuccess && rows.length === 0 ? (
        <div data-testid='empty-state'>
          {api.scope === 'server' ? (
            <DropZone onFiles={openNew} />
          ) : (
            <p className='text-ink-muted'>No reviews yet.</p>
          )}
          <p className='mt-3 text-center text-ink-muted'>
            Or{' '}
            <button
              type='button'
              data-testid='new-review-empty'
              className='rounded-sm underline'
              onClick={() => openNew()}
            >
              create an empty review
            </button>{' '}
            and add files later.
          </p>
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className='mb-3 flex flex-wrap items-center gap-2'>
            <Input
              type='search'
              aria-label='Search reviews'
              data-testid='search'
              placeholder='Search reviews'
              className='h-8 w-full sm:w-64'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label='Filter by client'
              data-testid='filter-client'
              className='h-8 rounded border border-input bg-paper px-2 text-sm max-sm:flex-1'
              value={client}
              onChange={(event) => setClient(event.target.value)}
            >
              <option value=''>All clients</option>
              {clients.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label='Filter by status'
              data-testid='filter-status'
              className='h-8 rounded border border-input bg-paper px-2 text-sm max-sm:flex-1'
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value=''>All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <span className='rl-num ml-auto text-xs text-ink-muted max-sm:hidden'>
              {filtered.length} of {rows.length}
            </span>
          </div>
          <ReviewTable rows={filtered} api={api} />
          {filtered.length === 0 ? (
            <p className='py-8 text-center text-ink-muted'>
              No reviews match these filters.
            </p>
          ) : null}
        </>
      ) : null}

      <NewReviewDialog
        key={newOpen ? 'open' : 'closed'}
        api={api}
        open={newOpen}
        files={files}
        onClose={() => setNewOpen(false)}
      />
    </div>
  );
}

function ReviewTable({ rows, api }: { rows: ReviewRow[]; api: TeamApi }) {
  return (
    <div className='border-y'>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='h-8 text-xs font-normal text-ink-muted'>Review</TableHead>
            <TableHead className='h-8 text-xs font-normal text-ink-muted max-sm:hidden'>Client</TableHead>
            <TableHead className='h-8 text-xs font-normal text-ink-muted max-sm:hidden'>Status</TableHead>
            <TableHead className='h-8 text-right text-xs font-normal text-ink-muted max-sm:hidden'>Open comments</TableHead>
            <TableHead className='h-8 text-right text-xs font-normal text-ink-muted max-sm:hidden'>Unread</TableHead>
            <TableHead className='h-8 text-right text-xs font-normal text-ink-muted'>Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-testid='review-row' className='relative hover:bg-wash'>
              <TableCell className='max-w-0 py-2.5 max-sm:w-full sm:w-[34%]'>
                <Link
                  to={api.paths.review(row.id) as never}
                  data-testid='review-link'
                  className='block truncate rounded-sm font-medium after:absolute after:inset-0 hover:underline'
                >
                  {row.unread ? (
                    <span className='mr-1.5 inline-block size-1.5 rounded-full bg-ink align-middle' aria-hidden />
                  ) : null}
                  {row.name}
                </Link>
                <span className='block text-xs text-ink-muted sm:hidden'>
                  {row.clientName} · <StatusLabel status={row.status} /> · {row.openComments} open
                </span>
              </TableCell>
              <TableCell className='max-w-40 truncate py-2.5 max-sm:hidden'>{row.clientName}</TableCell>
              <TableCell className='py-2.5 max-sm:hidden'>
                <StatusLabel status={row.status} />
              </TableCell>
              <TableCell className='rl-num py-2.5 text-right max-sm:hidden'>{row.openComments}</TableCell>
              <TableCell className='rl-num py-2.5 text-right max-sm:hidden'>
                {row.unread ? (
                  <span data-testid='row-unread' className='font-medium'>
                    {row.unread}
                  </span>
                ) : (
                  <span className='text-ink-muted'>0</span>
                )}
              </TableCell>
              <TableCell className='rl-num py-2.5 text-right text-xs whitespace-nowrap text-ink-muted' title={fullDate(row.lastActivityAt)}>
                <span suppressHydrationWarning>{timeAgo(row.lastActivityAt)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
