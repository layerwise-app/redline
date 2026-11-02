import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Keyboard,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  Sun,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AssetDTO,
  CommentDTO,
  DecisionKind,
  ReviewSnapshot
} from '~/domain/dto';
import { STATUS_LABELS } from '~/domain/status';
import { fullDate, pinLabel, timeAgo } from '~/client/format';
import { readDraft, writeDraft } from '~/client/use-draft';
import type { ReviewApi } from '~/client/api';
import { readableOn } from '~/lib/redline/color';
import type { Point, View } from '~/lib/redline/geometry';
import { redline } from '~/redline.config';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '~/components/ui/popover';
import { useIsMobile } from '~/hooks/use-mobile';
import { cn } from '~/lib/utils';
import { Canvas, type CanvasHandle, type CanvasPin } from './Canvas';
import { NewPinComposer, ThreadRow, type ThreadActions } from './CommentPanel';
import { Compare } from './Compare';
import { IdentityDialog, ReportDialog } from './GuestDialogs';
import { StatusMark } from './StatusMark';

type Filter = 'open' | 'resolved' | 'all';

type PendingPin = {
  assetId: string;
  versionId: string;
  pageNumber: number;
  x: number;
  y: number;
  body: string;
  internal: boolean;
};

export type TeamToolsContext = {
  snapshot: ReviewSnapshot;
  asset: AssetDTO | null;
  /** Jump to an asset after an upload, showing its newest version. */
  showAsset(assetId: string): void;
  refresh(): Promise<unknown>;
};

const THEME_KEY = 'redline:canvas-theme';

const SHORTCUTS: [string, string][] = [
  ['C', 'Drop a comment pin'],
  ['N / P', 'Next and previous pin'],
  ['R', 'Resolve or reopen the selected pin'],
  ['V', 'Open versions'],
  ['Space + drag', 'Pan the canvas'],
  ['Wheel or pinch', 'Zoom'],
  ['Esc', 'Cancel or close'],
  ['Cmd/Ctrl + Enter', 'Send a comment']
];

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest?.('input, textarea, select, [contenteditable="true"]')
  );
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function ReviewScreen({
  api,
  initial,
  back,
  title,
  teamTools,
  emptySlot,
  notice,
  embedded = false,
  focusComment,
  focusAsset,
  draftScope
}: {
  api: ReviewApi;
  initial?: ReviewSnapshot;
  /** Left of the title: a link back, or the workspace's brand on guest pages. */
  back?: ReactNode;
  title?: ReactNode;
  teamTools?: (context: TeamToolsContext) => ReactNode;
  emptySlot?: (context: TeamToolsContext) => ReactNode;
  notice?: ReactNode;
  embedded?: boolean;
  focusComment?: string;
  focusAsset?: string;
  /** Distinct drafts per person type, so team and guest text never mix. */
  draftScope: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: api.queryKey,
    queryFn: api.load,
    initialData: initial,
    refetchInterval: api.poll ? redline.canvas.pollMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: api.poll,
    staleTime: 2000
  });
  const snapshot = query.data;
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: api.queryKey }),
    [queryClient, api.queryKey]
  );

  const isMobile = useIsMobile();
  const canvasRef = useRef<CanvasHandle>(null);
  const [assetId, setAssetId] = useState<string | null>(focusAsset ?? null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPin | null>(null);
  const [placing, setPlacing] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [zoom, setZoom] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [identityFor, setIdentityFor] = useState<null | (() => Promise<void>)>(null);
  const cancelIdentity = useRef<null | (() => void)>(null);
  const [identityEditing, setIdentityEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [focusReplyFor, setFocusReplyFor] = useState<string | null>(null);
  const draftKey = `${draftScope}:pin`;

  const asset =
    snapshot?.assets.find((candidate) => candidate.id === assetId) ??
    snapshot?.assets[0] ??
    null;
  const version =
    asset?.versions.find((candidate) => candidate.id === versionId) ??
    asset?.versions.find((candidate) => candidate.id === asset.currentVersionId) ??
    null;
  const page =
    version?.pages[Math.min(pageNumber, version.pages.length) - 1] ??
    version?.pages[0] ??
    null;
  const isCurrent = version?.id === asset?.currentVersionId;
  const isTeam = snapshot?.viewer === 'team';

  // Restore a draft pin and the canvas theme after mount (browser only).
  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') setTheme(saved);
    const draft = readDraft<PendingPin>(draftKey);
    if (draft) {
      setPending(draft);
      setAssetId(draft.assetId);
      setVersionId(draft.versionId);
      setPageNumber(draft.pageNumber);
    }
  }, [draftKey]);

  // Deep links from the Inbox and from email.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !focusComment || !snapshot) return;
    const comment = snapshot.comments.find((c) => c.id === focusComment);
    if (!comment) return;
    focused.current = true;
    const root = comment.parentId
      ? snapshot.comments.find((c) => c.id === comment.parentId) ?? comment
      : comment;
    setAssetId(root.assetId);
    setVersionId(root.versionId);
    setPageNumber(root.pageNumber);
    setSelectedId(root.id);
    setFilter(root.resolvedAt ? 'all' : 'open');
    setSheetOpen(true);
  }, [focusComment, snapshot]);

  const versionComments = useMemo(
    () =>
      snapshot && version
        ? snapshot.comments.filter((comment) => comment.versionId === version.id)
        : [],
    [snapshot, version]
  );
  const repliesOf = useCallback(
    (id: string) => versionComments.filter((comment) => comment.parentId === id),
    [versionComments]
  );
  const roots = useMemo(
    () =>
      versionComments
        .filter((comment) => !comment.parentId)
        .slice()
        .sort(
          (a, b) =>
            a.pageNumber - b.pageNumber ||
            Number(a.internal) - Number(b.internal) ||
            (a.pin ?? 0) - (b.pin ?? 0)
        ),
    [versionComments]
  );
  const counts = useMemo(() => {
    const open = roots.filter((c) => !c.resolvedAt).length;
    return { open, resolved: roots.length - open, all: roots.length };
  }, [roots]);
  const listed = useMemo(
    () =>
      roots.filter((comment) =>
        filter === 'all'
          ? true
          : filter === 'open'
            ? !comment.resolvedAt
            : Boolean(comment.resolvedAt)
      ),
    [roots, filter]
  );

  const canvasPins: CanvasPin[] = useMemo(
    () =>
      listed
        .filter(
          (comment) =>
            comment.pageNumber === (page?.number ?? 1) &&
            comment.x !== null &&
            comment.y !== null
        )
        .map((comment) => ({
          id: comment.id,
          x: comment.x!,
          y: comment.y!,
          label: pinLabel(comment),
          internal: comment.internal,
          resolved: Boolean(comment.resolvedAt),
          selected: comment.id === selectedId,
          title: `Pin ${pinLabel(comment)}${comment.internal ? ', internal' : ''}, ${comment.authorName || 'deleted'}: ${comment.body.slice(0, 80)}`
        })),
    [listed, page?.number, selectedId]
  );

  const select = useCallback(
    (comment: CommentDTO, options: { reveal?: boolean; reply?: boolean } = {}) => {
      setSelectedId(comment.id);
      setPageNumber(comment.pageNumber);
      setFocusReplyFor(options.reply ? comment.id : null);
      if (isMobile) setSheetOpen(true);
      if (options.reveal && comment.x !== null && comment.y !== null) {
        const point = { x: comment.x, y: comment.y };
        // Page changes re-fit on the next frame, so reveal after that.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => canvasRef.current?.reveal(point))
        );
      }
    },
    [isMobile]
  );

  const movePin = useCallback(
    (step: 1 | -1) => {
      if (!listed.length) return;
      const index = listed.findIndex((comment) => comment.id === selectedId);
      const next =
        index < 0
          ? step === 1
            ? listed[0]!
            : listed[listed.length - 1]!
          : listed[(index + step + listed.length) % listed.length]!;
      select(next, { reveal: true });
    },
    [listed, selectedId, select]
  );

  const savePending = useCallback(
    (next: PendingPin | null) => {
      setPending(next);
      writeDraft(draftKey, next);
    },
    [draftKey]
  );

  const onDrop = useCallback(
    (point: Point) => {
      if (!asset || !version || !page) return;
      setSelectedId(null);
      setComposerError(null);
      setPending((current) => {
        const next: PendingPin = {
          assetId: asset.id,
          versionId: version.id,
          pageNumber: page.number,
          x: point.x,
          y: point.y,
          // Moving a pin keeps whatever was already typed.
          body: current?.body ?? '',
          internal: current?.internal ?? false
        };
        writeDraft(draftKey, next);
        return next;
      });
      setSheetOpen(true);
    },
    [asset, version, page, draftKey]
  );

  /** Runs now, or after the guest gives a name if they haven't yet. */
  const withIdentity = useCallback(
    (run: () => Promise<void>) => {
      if (api.identity === 'required' && !snapshot?.guest) {
        setIdentityFor(() => run);
        return Promise.resolve();
      }
      return run();
    },
    [api.identity, snapshot?.guest]
  );

  const submitPending = useCallback(async () => {
    if (!pending || !pending.body.trim() || composerBusy) return;
    await withIdentity(async () => {
      setComposerBusy(true);
      setComposerError(null);
      try {
        await api.addPin({
          versionId: pending.versionId,
          pageNumber: pending.pageNumber,
          x: pending.x,
          y: pending.y,
          body: pending.body,
          internal: pending.internal
        });
        savePending(null);
        if (filter === 'resolved') setFilter('open');
        await refresh();
      } catch (cause) {
        setComposerError(errorMessage(cause, 'That didn’t send. Try again.'));
      } finally {
        setComposerBusy(false);
      }
    });
  }, [pending, composerBusy, withIdentity, api, savePending, filter, refresh]);

  const actions: ThreadActions = useMemo(() => {
    const wrap = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (cause) {
        toast.error(errorMessage(cause, 'That didn’t work. Try again.'));
      } finally {
        await refresh();
      }
    };
    return {
      reply: async (input) => {
        // Stays pending through the name prompt, so the reply box keeps its draft.
        await new Promise<void>((resolve, reject) => {
          cancelIdentity.current = () =>
            reject(new Error('Add your name to send this reply.'));
          void withIdentity(async () => {
            try {
              const result = (await api.reply(input)) as
                | { notices?: string[] }
                | undefined;
              for (const message of result?.notices ?? []) toast.warning(message);
              await refresh();
              resolve();
            } catch (cause) {
              reject(cause);
            }
          });
        });
      },
      edit: (input) => wrap(() => api.edit(input)),
      remove: (id) =>
        wrap(async () => {
          await api.remove(id);
          setSelectedId((current) => (current === id ? null : current));
        }),
      setResolved: (input) =>
        withIdentity(() => wrap(() => api.setResolved(input)))
    };
  }, [api, refresh, withIdentity]);

  const cancelPending = useCallback(() => {
    savePending(null);
    setComposerError(null);
  }, [savePending]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (comparing) return;
      if (event.key === 'Escape') {
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
        if (placing) setPlacing(false);
        else if (pending && !pending.body.trim()) cancelPending();
        else if (selectedId) setSelectedId(null);
        else if (sheetOpen) setSheetOpen(false);
        return;
      }
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'c' && page) {
        event.preventDefault();
        setSelectedId(null);
        setPlacing(true);
      } else if (key === 'n') {
        event.preventDefault();
        movePin(1);
      } else if (key === 'p') {
        event.preventDefault();
        movePin(-1);
      } else if (key === 'r' && selectedId) {
        const comment = roots.find((candidate) => candidate.id === selectedId);
        if (comment) {
          event.preventDefault();
          void actions.setResolved({
            id: comment.id,
            resolved: !comment.resolvedAt
          });
        }
      } else if (key === 'v' && asset) {
        event.preventDefault();
        setVersionsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    embedded,
    comparing,
    placing,
    pending,
    selectedId,
    sheetOpen,
    page,
    asset,
    roots,
    movePin,
    actions,
    cancelPending
  ]);

  // The sheet takes room from the canvas, so keep the spot under discussion in view.
  useEffect(() => {
    if (!isMobile || !sheetOpen) return;
    const selected = roots.find((comment) => comment.id === selectedId);
    const point = pending ?? selected;
    if (!point || point.x === null || point.y === null) return;
    const spot = { x: point.x, y: point.y };
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => canvasRef.current?.reveal(spot))
    );
    return () => cancelAnimationFrame(frame);
    // Only when the sheet or the selection changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, sheetOpen, selectedId, pending?.x, pending?.y]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // The choice just won't persist.
    }
  };

  const onView = useCallback((view: View) => setZoom(view.zoom), []);

  const decide = useCallback(
    (decision: DecisionKind) => {
      if (!api.decide || !asset || !version) return;
      void withIdentity(async () => {
        try {
          await api.decide!({
            assetId: asset.id,
            versionId: version.id,
            decision
          });
          await refresh();
          toast.success(
            decision === 'approved'
              ? `${asset.name} approved on V${version.number}.`
              : `Change request recorded on V${version.number}.`
          );
        } catch (cause) {
          toast.error(errorMessage(cause, 'That didn’t save.'));
          await refresh();
        }
      });
    },
    [api, asset, version, withIdentity, refresh]
  );

  const sendFeedback = useCallback(() => {
    if (!api.sendFeedback) return;
    void withIdentity(async () => {
      try {
        const result = await api.sendFeedback!();
        toast.success(
          `Thanks. The team has your ${result.count} ${result.count === 1 ? 'comment' : 'comments'}.`
        );
      } catch (cause) {
        toast.error(errorMessage(cause, 'That didn’t send.'));
      }
    });
  }, [api, withIdentity]);

  const context: TeamToolsContext | null = snapshot
    ? {
        snapshot,
        asset,
        showAsset: (id) => {
          setAssetId(id);
          setVersionId(null);
          setPageNumber(1);
          setSelectedId(null);
        },
        refresh
      }
    : null;

  const accentStyle = snapshot
    ? ({
        '--pin': snapshot.brand.accentColor,
        '--pin-ink': readableOn(snapshot.brand.accentColor)
      } as React.CSSProperties)
    : undefined;

  if (!snapshot) {
    if (query.error) throw query.error;
    return <div className='h-full bg-wash' />;
  }

  const panel = (
    <CommentList
      asset={asset}
      version={version}
      isCurrent={Boolean(isCurrent)}
      snapshot={snapshot}
      filter={filter}
      counts={counts}
      listed={listed}
      repliesOf={repliesOf}
      selectedId={selectedId}
      focusReplyFor={focusReplyFor}
      pending={pending}
      composerBusy={composerBusy}
      composerError={composerError}
      nextPinLabel={nextPinLabel(roots, pending?.internal ?? false)}
      draftScope={draftScope}
      canMarkInternal={Boolean(isTeam)}
      embedded={embedded}
      actions={actions}
      onFilter={setFilter}
      onSelect={(comment) => {
        if (selectedId === comment.id) setSelectedId(null);
        else select(comment, { reveal: true });
      }}
      onPendingChange={(change) =>
        pending && savePending({ ...pending, ...change })
      }
      onSubmitPending={submitPending}
      onCancelPending={cancelPending}
      onDecide={api.decide ? decide : undefined}
      onFeedback={api.sendFeedback ? sendFeedback : undefined}
      onShowCurrent={() => setVersionId(null)}
      onReport={api.report ? () => setReporting(true) : undefined}
      onEditIdentity={
        api.setIdentity && snapshot.guest
          ? () => setIdentityEditing(true)
          : undefined
      }
    />
  );

  return (
    <div
      className='flex h-full min-h-0 flex-col bg-paper'
      style={accentStyle}
      data-testid='review-screen'
      data-viewer={snapshot.viewer}
    >
      {notice}
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-2 py-1.5 sm:px-3'>
        {back ? <div className='max-sm:order-1'>{back}</div> : null}
        {/* On phones the review's name gets its own line, with the controls below it. */}
        <span aria-hidden className='order-4 hidden h-0 basis-full max-sm:block' />
        <div className='mr-1 min-w-0 max-sm:order-2 max-sm:flex-1'>
          {title !== undefined ? (
            title
          ) : (
            <>
              <h1 className='truncate text-sm leading-tight font-medium'>{snapshot.name}</h1>
              <p className='truncate text-xs leading-tight text-ink-muted'>{snapshot.clientName}</p>
            </>
          )}
        </div>

        {asset && version ? (
          <div className='flex min-w-0 items-center gap-1 max-sm:order-5'>
            {snapshot.assets.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='sm' className='min-w-0' data-testid='asset-menu'>
                    <span className='max-w-40 truncate max-sm:max-w-20'>{asset.name}</span>
                    <ChevronDown aria-hidden className='size-3.5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  {snapshot.assets.map((candidate) => (
                    <DropdownMenuItem
                      key={candidate.id}
                      onSelect={() => {
                        setAssetId(candidate.id);
                        setVersionId(null);
                        setPageNumber(1);
                        setSelectedId(null);
                      }}
                    >
                      <StatusMark status={candidate.status} />
                      {candidate.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className='max-w-44 truncate px-1 text-sm text-ink-muted max-sm:hidden'>
                {asset.name}
              </span>
            )}

            {!embedded ? (
              <DropdownMenu open={versionsOpen} onOpenChange={setVersionsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='sm' className='rl-num' data-testid='version-menu'>
                    V{version.number}
                    {isCurrent ? '' : ' (old)'}
                    <ChevronDown aria-hidden className='size-3.5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='min-w-60'>
                  {[...asset.versions].reverse().map((candidate) => (
                    <DropdownMenuItem
                      key={candidate.id}
                      data-testid={`version-${candidate.number}`}
                      onSelect={() => {
                        setVersionId(candidate.id);
                        setPageNumber(1);
                        setSelectedId(null);
                      }}
                    >
                      <span className='rl-num font-medium'>V{candidate.number}</span>
                      <span className='text-xs text-ink-muted' suppressHydrationWarning>
                        {candidate.id === asset.currentVersionId ? 'Current · ' : ''}
                        {timeAgo(candidate.createdAt)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  {asset.versions.length > 1 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid='open-compare'
                        onSelect={() => setComparing(true)}
                      >
                        <Columns2 aria-hidden className='size-4' />
                        Compare versions
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {version.pages.length > 1 && page ? (
              <div className='flex items-center'>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label='Previous page'
                  disabled={page.number <= 1}
                  onClick={() => setPageNumber(page.number - 1)}
                >
                  <ChevronLeft aria-hidden className='size-4' />
                </Button>
                <span className='rl-num text-xs whitespace-nowrap' data-testid='page-indicator'>
                  {page.number}/{version.pages.length}
                </span>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label='Next page'
                  disabled={page.number >= version.pages.length}
                  onClick={() => setPageNumber(page.number + 1)}
                >
                  <ChevronRight aria-hidden className='size-4' />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {page ? (
          <div className='ml-auto flex items-center max-sm:order-6' role='group' aria-label='Zoom'>
              <Button variant='ghost' size='icon-sm' aria-label='Zoom out' className='max-sm:hidden' onClick={() => canvasRef.current?.zoomBy(1 / 1.25)}>
                <Minus aria-hidden className='size-3.5' />
              </Button>
              <span className='rl-num w-11 text-center text-xs max-sm:hidden' data-testid='zoom-level'>
                {zoom === null ? '' : `${Math.round(zoom * 100)}%`}
              </span>
              <Button variant='ghost' size='icon-sm' aria-label='Zoom in' className='max-sm:hidden' onClick={() => canvasRef.current?.zoomBy(1.25)}>
                <Plus aria-hidden className='size-3.5' />
              </Button>
              <Button variant='ghost' size='sm' data-testid='zoom-fit' onClick={() => canvasRef.current?.fit()}>
                Fit
              </Button>
              <Button variant='ghost' size='sm' className='rl-num' data-testid='zoom-100' onClick={() => canvasRef.current?.actualSize()}>
                100%
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={theme === 'light' ? 'Dark canvas' : 'Light canvas'}
                data-testid='canvas-theme'
                onClick={toggleTheme}
              >
                {theme === 'light' ? (
                  <Moon aria-hidden className='size-3.5' />
                ) : (
                  <Sun aria-hidden className='size-3.5' />
                )}
              </Button>
          </div>
        ) : null}
        <div className='flex items-center gap-1 max-sm:order-3'>
          {version?.downloadUrl ? (
            <Button variant='ghost' size='icon-sm' asChild>
              <a href={version.downloadUrl} aria-label={`Download ${version.originalName}`} data-testid='download'>
                <Download aria-hidden className='size-3.5' />
              </a>
            </Button>
          ) : null}
          {!embedded ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant='ghost' size='icon-sm' aria-label='Keyboard shortcuts' className='max-sm:hidden'>
                  <Keyboard aria-hidden className='size-3.5' />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-64 p-3'>
                <p className='mb-2 font-medium'>Shortcuts</p>
                <dl className='space-y-1'>
                  {SHORTCUTS.map(([keys, label]) => (
                    <div key={keys} className='flex justify-between gap-3 text-xs'>
                      <dt className='text-ink-muted'>{label}</dt>
                      <dd className='rl-num whitespace-nowrap'>{keys}</dd>
                    </div>
                  ))}
                </dl>
              </PopoverContent>
            </Popover>
          ) : null}
          {context && teamTools ? teamTools(context) : null}
        </div>
      </div>

      <div className='relative flex min-h-0 flex-1 max-md:flex-col'>
        <div className='relative min-h-0 min-w-0 flex-1'>
          {page && asset && version ? (
            <Canvas
              ref={canvasRef}
              page={page}
              alt={`${asset.name}, version ${version.number}, page ${page.number}`}
              pins={canvasPins}
              pending={
                pending &&
                pending.versionId === version.id &&
                pending.pageNumber === page.number
                  ? {
                      x: pending.x,
                      y: pending.y,
                      internal: pending.internal,
                      label: nextPinLabel(roots, pending.internal)
                    }
                  : null
              }
              theme={theme}
              placing={placing}
              onPlacingChange={setPlacing}
              onDrop={onDrop}
              onSelectPin={(id) => {
                const comment = roots.find((candidate) => candidate.id === id);
                if (comment) select(comment);
              }}
              onViewChange={onView}
              hint={!isMobile}
            />
          ) : context && emptySlot ? (
            emptySlot(context)
          ) : (
            <div className='flex h-full items-center justify-center bg-wash p-6 text-center text-ink-muted'>
              Nothing to review yet.
            </div>
          )}
          {comparing && asset && version ? (
            <Compare
              asset={asset}
              theme={theme}
              initialB={asset.currentVersionId}
              onClose={() => setComparing(false)}
            />
          ) : null}
        </div>

        {/* Side panel on wide screens. */}
        {page && !isMobile ? (
          <aside
            data-testid='side-panel'
            aria-label='Comments'
            className='flex w-[340px] shrink-0 flex-col border-l bg-paper'
          >
            {panel}
          </aside>
        ) : null}

        {/* Bottom sheet on phones. */}
        {page && isMobile ? (
          <>
            {!sheetOpen ? (
              <button
                type='button'
                data-testid='sheet-open'
                className='absolute inset-x-3 bottom-3 z-10 flex h-11 items-center justify-center gap-2 rounded bg-ink text-sm font-medium text-white'
                onClick={() => setSheetOpen(true)}
              >
                <MessageSquare aria-hidden className='size-4' />
                {counts.open} open {counts.open === 1 ? 'comment' : 'comments'}
              </button>
            ) : (
              <section
                data-testid='bottom-sheet'
                aria-label='Comments'
                className='flex h-[56%] shrink-0 flex-col border-t bg-paper'
              >
                <div className='flex items-center justify-between border-b px-3 py-1.5'>
                  <span className='font-medium'>Comments</span>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label='Close comments'
                    data-testid='sheet-close'
                    onClick={() => setSheetOpen(false)}
                  >
                    <X aria-hidden className='size-4' />
                  </Button>
                </div>
                <div className='flex min-h-0 flex-1 flex-col'>{panel}</div>
              </section>
            )}
          </>
        ) : null}
      </div>

      {api.setIdentity ? (
        <>
          <IdentityDialog
            open={Boolean(identityFor)}
            title='Add your name to continue'
            onClose={() => {
              cancelIdentity.current?.();
              setIdentityFor(null);
            }}
            onSave={async (input) => {
              await api.setIdentity!(input);
              const run = identityFor;
              setIdentityFor(null);
              await refresh();
              await run?.();
            }}
          />
          {snapshot.guest ? (
            <IdentityDialog
              key={`${snapshot.guest.name}|${snapshot.guest.email ?? ''}`}
              open={identityEditing}
              title='Your details'
              initialName={snapshot.guest.name}
              initialEmail={snapshot.guest.email ?? ''}
              onClose={() => setIdentityEditing(false)}
              onSave={async (input) => {
                await api.setIdentity!(input);
                setIdentityEditing(false);
                await refresh();
              }}
            />
          ) : null}
        </>
      ) : null}
      {api.report ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          onSubmit={api.report}
        />
      ) : null}
    </div>
  );
}

function nextPinLabel(roots: CommentDTO[], internal: boolean) {
  const top = Math.max(
    0,
    ...roots
      .filter((comment) => comment.internal === internal)
      .map((comment) => comment.pin ?? 0)
  );
  return `${internal ? 'I' : ''}${top + 1}`;
}

function CommentList({
  asset,
  version,
  isCurrent,
  snapshot,
  filter,
  counts,
  listed,
  repliesOf,
  selectedId,
  focusReplyFor,
  pending,
  composerBusy,
  composerError,
  nextPinLabel: label,
  draftScope,
  canMarkInternal,
  embedded,
  actions,
  onFilter,
  onSelect,
  onPendingChange,
  onSubmitPending,
  onCancelPending,
  onDecide,
  onFeedback,
  onShowCurrent,
  onReport,
  onEditIdentity
}: {
  asset: AssetDTO | null;
  version: AssetDTO['versions'][number] | null;
  isCurrent: boolean;
  snapshot: ReviewSnapshot;
  filter: Filter;
  counts: { open: number; resolved: number; all: number };
  listed: CommentDTO[];
  repliesOf(id: string): CommentDTO[];
  selectedId: string | null;
  focusReplyFor: string | null;
  pending: PendingPin | null;
  composerBusy: boolean;
  composerError: string | null;
  nextPinLabel: string;
  draftScope: string;
  canMarkInternal: boolean;
  embedded: boolean;
  actions: ThreadActions;
  onFilter(filter: Filter): void;
  onSelect(comment: CommentDTO): void;
  onPendingChange(change: Partial<PendingPin>): void;
  onSubmitPending(): void;
  onCancelPending(): void;
  onDecide?(decision: DecisionKind): void;
  onFeedback?(): void;
  onShowCurrent(): void;
  onReport?(): void;
  onEditIdentity?(): void;
}) {
  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: 'open', label: 'Open', count: counts.open },
    { value: 'resolved', label: 'Resolved', count: counts.resolved },
    { value: 'all', label: 'All', count: counts.all }
  ];
  const multiPage = (version?.pages.length ?? 1) > 1;

  return (
    <>
      <div role='tablist' aria-label='Filter comments' className='flex border-b px-1'>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type='button'
            role='tab'
            aria-selected={filter === tab.value}
            data-testid={`filter-${tab.value}`}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-sm px-2 text-xs',
              filter === tab.value
                ? 'font-medium shadow-[inset_0_-2px_0_var(--rl-ink)]'
                : 'text-ink-muted hover:text-ink'
            )}
            onClick={() => onFilter(tab.value)}
          >
            {tab.label}
            <span className='rl-num'>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain' data-testid='comment-list'>
        {pending ? (
          <NewPinComposer
            label={label}
            body={pending.body}
            internal={pending.internal}
            canMarkInternal={canMarkInternal}
            busy={composerBusy}
            error={composerError}
            onBodyChange={(body) => onPendingChange({ body })}
            onInternalChange={(internal) => onPendingChange({ internal })}
            onSubmit={onSubmitPending}
            onCancel={onCancelPending}
          />
        ) : null}
        {listed.length ? (
          <ul>
            {listed.map((comment) => (
              <ThreadRow
                key={comment.id}
                comment={comment}
                replies={repliesOf(comment.id)}
                selected={comment.id === selectedId}
                focusReply={comment.id === focusReplyFor}
                pageLabel={multiPage ? `Page ${comment.pageNumber}` : null}
                scope={draftScope}
                canMarkInternal={canMarkInternal}
                actions={actions}
                onSelect={() => onSelect(comment)}
              />
            ))}
          </ul>
        ) : pending ? null : (
          <p className='p-4 text-ink-muted'>
            {filter === 'resolved'
              ? 'Nothing resolved yet.'
              : filter === 'open' && counts.all > 0
                ? 'All comments on this version are resolved.'
                : 'No comments yet. Click anywhere on the design to drop a pin.'}
          </p>
        )}
      </div>

      {!embedded && asset && version ? (
        <DecisionFooter
          asset={asset}
          version={version}
          isCurrent={isCurrent}
          onDecide={onDecide}
          onFeedback={onFeedback}
          onShowCurrent={onShowCurrent}
          guestName={snapshot.guest?.name ?? null}
          onEditIdentity={onEditIdentity}
          onReport={onReport}
        />
      ) : null}
    </>
  );
}

function DecisionFooter({
  asset,
  version,
  isCurrent,
  onDecide,
  onFeedback,
  onShowCurrent,
  guestName,
  onEditIdentity,
  onReport
}: {
  asset: AssetDTO;
  version: AssetDTO['versions'][number];
  isCurrent: boolean;
  onDecide?(decision: DecisionKind): void;
  onFeedback?(): void;
  onShowCurrent(): void;
  guestName: string | null;
  onEditIdentity?(): void;
  onReport?(): void;
}) {
  const current = asset.versions.find((v) => v.id === asset.currentVersionId);
  const history = [...asset.decisions].reverse();
  return (
    <div className='border-t' data-testid='decision-panel'>
      <div className='space-y-2 p-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='flex items-center gap-1.5 font-medium' data-testid='asset-status'>
            <StatusMark status={asset.status} />
            {STATUS_LABELS[asset.status]}
          </span>
          {current ? (
            <span className='rl-num text-xs text-ink-muted'>V{current.number} is current</span>
          ) : null}
        </div>
        {onDecide ? (
          isCurrent ? (
            <div className='flex gap-2'>
              <Button
                size='sm'
                className='flex-1'
                data-testid='approve'
                disabled={asset.status === 'approved'}
                onClick={() => onDecide('approved')}
              >
                Approve
              </Button>
              <Button
                size='sm'
                variant='outline'
                className='flex-1'
                data-testid='request-changes'
                disabled={asset.status === 'changes_requested'}
                onClick={() => onDecide('changes_requested')}
              >
                Request changes
              </Button>
            </div>
          ) : (
            <p className='text-xs text-ink-muted'>
              You’re viewing V{version.number}. Decisions apply to the current version.{' '}
              <button type='button' className='underline' onClick={onShowCurrent}>
                Go to V{current?.number}
              </button>
            </p>
          )
        ) : null}
        {history.length ? (
          <details data-testid='decision-history'>
            <summary className='cursor-pointer rounded-sm text-xs text-ink-muted hover:text-ink'>
              Decision history ({history.length})
            </summary>
            <ul className='mt-1.5 space-y-1'>
              {history.map((decision) => (
                <li key={decision.id} className='text-xs' title={fullDate(decision.createdAt)}>
                  <span className='rl-num'>V{decision.versionNumber}</span>{' '}
                  {decision.decision === 'approved' ? 'Approved' : 'Changes requested'}{' '}
                  by {decision.name},{' '}
                  <span suppressHydrationWarning>{timeAgo(decision.createdAt)}</span>
                </li>
              ))}
            </ul>
            <p className='mt-1 text-xs text-ink-muted'>Names are as entered, not verified.</p>
          </details>
        ) : null}
      </div>
      {onFeedback || onReport || guestName ? (
        <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t px-3 py-2'>
          {onFeedback ? (
            <Button size='sm' variant='secondary' data-testid='send-feedback' onClick={onFeedback}>
              Send feedback
            </Button>
          ) : null}
          {guestName && onEditIdentity ? (
            <button
              type='button'
              className='rounded-sm text-xs text-ink-muted hover:text-ink hover:underline'
              onClick={onEditIdentity}
            >
              As {guestName}
            </button>
          ) : null}
          {onReport ? (
            <button
              type='button'
              data-testid='report-page'
              className='ml-auto rounded-sm text-xs text-ink-muted hover:text-ink hover:underline'
              onClick={onReport}
            >
              Report this page
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
