import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, RotateCcw } from 'lucide-react';
import type { CommentDTO } from '~/domain/dto';
import { fullDate, pinLabel, timeAgo } from '~/client/format';
import { useDraftText } from '~/client/use-draft';
import { LINK_REL, linkify } from '~/lib/redline/linkify';
import { redline } from '~/redline.config';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';

export function CommentText({ body }: { body: string }) {
  return (
    <p className='break-words whitespace-pre-wrap'>
      {linkify(body).map((part, index) =>
        part.type === 'link' ? (
          <a
            key={index}
            href={part.href}
            target='_blank'
            rel={LINK_REL}
            className='underline'
            onClick={(event) => event.stopPropagation()}
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </p>
  );
}

function Stamp({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={fullDate(iso)}
      suppressHydrationWarning
      className='rl-num text-xs whitespace-nowrap text-ink-muted'
    >
      {timeAgo(iso)}
    </time>
  );
}

function CharCount({ length }: { length: number }) {
  const max = redline.limits.commentMaxLength;
  if (length < max - 200) return null;
  return (
    <span className={cn('rl-num text-xs', length > max ? 'font-medium text-destructive' : 'text-ink-muted')}>
      {length}/{max}
    </span>
  );
}

/** Text box that sends on Cmd/Ctrl+Enter and keeps its draft across reloads. */
function BodyField({
  value,
  onChange,
  onSubmit,
  onCancel,
  label,
  placeholder,
  autoFocus,
  rows = 3
}: {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  onCancel?(): void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <Textarea
      ref={ref}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      rows={rows}
      className='min-h-0 resize-y bg-paper text-sm'
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          event.currentTarget.blur();
          onCancel?.();
        }
      }}
    />
  );
}

function InternalToggle({
  id,
  checked,
  onChange
}: {
  id: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <div className='flex items-center gap-2'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className='text-xs font-normal'>
        Internal: team only
      </Label>
    </div>
  );
}

export function NewPinComposer({
  label,
  body,
  internal,
  canMarkInternal,
  busy,
  error,
  onBodyChange,
  onInternalChange,
  onSubmit,
  onCancel
}: {
  label: string;
  body: string;
  internal: boolean;
  canMarkInternal: boolean;
  busy: boolean;
  error: string | null;
  onBodyChange(value: string): void;
  onInternalChange(value: boolean): void;
  onSubmit(): void;
  onCancel(): void;
}) {
  return (
    <form
      data-testid='new-pin-composer'
      className={cn('space-y-2 border-b p-3', internal && 'rl-internal-block')}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className='flex items-center gap-2'>
        <span
          className='rl-pin rl-pin-inline'
          data-internal={internal}
        >
          {label}
        </span>
        <span className='font-medium'>New comment</span>
        {internal ? (
          <span className='rl-internal-label ml-auto'>INTERNAL</span>
        ) : null}
      </div>
      <BodyField
        autoFocus
        label='Comment'
        placeholder='What should change here?'
        value={body}
        onChange={onBodyChange}
        onSubmit={onSubmit}
      />
      {canMarkInternal ? (
        <InternalToggle
          id='new-pin-internal'
          checked={internal}
          onChange={onInternalChange}
        />
      ) : null}
      {internal ? (
        <p className='rl-internal-label'>Clients will never see this comment.</p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <div className='flex items-center gap-2'>
        <Button type='submit' size='sm' disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Comment'}
        </Button>
        <Button type='button' size='sm' variant='ghost' onClick={onCancel}>
          Cancel
        </Button>
        <span className='ml-auto'>
          <CharCount length={body.length} />
        </span>
      </div>
    </form>
  );
}

function CommentMeta({ comment }: { comment: CommentDTO }) {
  return (
    <div className='flex flex-wrap items-baseline gap-x-2'>
      <span className='font-medium'>{comment.deleted ? 'Deleted' : comment.authorName}</span>
      {comment.authorKind === 'team' && !comment.deleted ? (
        <span className='text-xs text-ink-muted'>Team</span>
      ) : null}
      <Stamp iso={comment.createdAt} />
      {comment.editedAt && !comment.deleted ? (
        <span className='text-xs text-ink-muted'>Edited</span>
      ) : null}
    </div>
  );
}

function EditForm({
  draftKey,
  initial,
  onSave,
  onClose
}: {
  draftKey: string;
  initial: string;
  onSave(body: string): Promise<unknown>;
  onClose(): void;
}) {
  const [text, setText, clear] = useDraftText(draftKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = text || initial;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      clear();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That didn’t save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='mt-1 space-y-2'>
      <BodyField
        autoFocus
        label='Edit comment'
        value={value}
        onChange={setText}
        onSubmit={save}
      />
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <div className='flex items-center gap-2'>
        <Button type='button' size='sm' disabled={busy || !value.trim()} onClick={save}>
          Save
        </Button>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={() => {
            clear();
            onClose();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ReplyBox({
  threadId,
  scope,
  canMarkInternal,
  forceInternal,
  onReply,
  autoFocus
}: {
  threadId: string;
  scope: string;
  canMarkInternal: boolean;
  forceInternal: boolean;
  onReply(input: { body: string; internal: boolean }): Promise<void>;
  autoFocus: boolean;
}) {
  const [text, setText, clear] = useDraftText(`${scope}:reply:${threadId}`);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInternal = forceInternal || internal;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onReply({ body: text, internal: isInternal });
      clear();
      setInternal(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That didn’t send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('mt-2 space-y-2', isInternal && 'rl-internal-block -mx-1 p-2')}>
      <BodyField
        autoFocus={autoFocus}
        rows={2}
        label='Reply'
        placeholder={isInternal ? 'Reply to the team' : 'Reply'}
        value={text}
        onChange={setText}
        onSubmit={send}
      />
      {canMarkInternal && !forceInternal ? (
        <InternalToggle
          id={`reply-internal-${threadId}`}
          checked={internal}
          onChange={setInternal}
        />
      ) : null}
      {isInternal ? (
        <p className='rl-internal-label'>Clients will never see this reply.</p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={busy || !text.trim()}
          onClick={send}
        >
          {busy ? 'Sending…' : 'Reply'}
        </Button>
        <span className='ml-auto'>
          <CharCount length={text.length} />
        </span>
      </div>
    </div>
  );
}

export type ThreadActions = {
  reply(input: { parentId: string; body: string; internal: boolean }): Promise<void>;
  edit(input: { id: string; body: string }): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  setResolved(input: { id: string; resolved: boolean }): Promise<unknown>;
};

function ReplyRow({
  reply,
  scope,
  actions
}: {
  reply: CommentDTO;
  scope: string;
  actions: ThreadActions;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li
      data-testid='reply'
      data-internal={reply.internal}
      className={cn(
        'flex gap-1.5 py-1.5',
        reply.internal && 'rl-internal-block -mx-1 my-1 px-1.5'
      )}
    >
      <CornerDownRight aria-hidden className='mt-0.5 size-3.5 shrink-0 text-ink-muted' />
      <div className='min-w-0 flex-1'>
        <CommentMeta comment={reply} />
        {reply.internal ? (
          <p className='rl-internal-label'>INTERNAL: TEAM ONLY</p>
        ) : null}
        {editing ? (
          <EditForm
            draftKey={`${scope}:edit:${reply.id}`}
            initial={reply.body}
            onSave={(body) => actions.edit({ id: reply.id, body })}
            onClose={() => setEditing(false)}
          />
        ) : (
          <CommentText body={reply.body} />
        )}
        {!editing && (reply.canEdit || reply.canDelete) ? (
          <div className='mt-1 flex gap-2'>
            {reply.canEdit ? (
              <TextAction onClick={() => setEditing(true)}>Edit</TextAction>
            ) : null}
            {reply.canDelete ? (
              <TextAction onClick={() => actions.remove(reply.id)}>Delete</TextAction>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TextAction({
  children,
  onClick
}: {
  children: React.ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type='button'
      className='rounded-sm text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline'
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function ThreadRow({
  comment,
  replies,
  selected,
  pageLabel,
  scope,
  canMarkInternal,
  actions,
  onSelect,
  focusReply
}: {
  comment: CommentDTO;
  replies: CommentDTO[];
  selected: boolean;
  pageLabel: string | null;
  scope: string;
  canMarkInternal: boolean;
  actions: ThreadActions;
  onSelect(): void;
  focusReply: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const resolved = Boolean(comment.resolvedAt);

  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  return (
    <li
      ref={rowRef}
      data-testid='thread'
      data-comment={comment.id}
      data-selected={selected}
      data-internal={comment.internal}
      className={cn(
        'border-b px-3 py-2.5',
        comment.internal ? 'rl-internal-block' : selected && 'bg-wash',
        selected && 'shadow-[inset_2px_0_0_var(--rl-ink)]'
      )}
    >
      <button
        type='button'
        className='flex w-full items-start gap-2.5 rounded-sm text-left'
        aria-expanded={selected}
        onClick={onSelect}
      >
        <span
          className='rl-pin rl-pin-inline mt-0.5'
          data-internal={comment.internal}
          data-resolved={resolved}
        >
          {pinLabel(comment)}
        </span>
        <span className='min-w-0 flex-1'>
          <CommentMeta comment={comment} />
          {comment.internal ? (
            <span className='rl-internal-label block'>INTERNAL: TEAM ONLY</span>
          ) : null}
          {comment.fromVersion ? (
            <span className='rl-num block text-xs text-ink-muted'>
              From V{comment.fromVersion}
            </span>
          ) : null}
        </span>
      </button>

      {/* Outside the button: comments hold links, and buttons can't contain them. */}
      <div className='pl-[36px]' onClick={selected ? undefined : onSelect}>
        {!editing ? (
          <div className={cn('mt-0.5', !selected && 'line-clamp-3')}>
            {comment.deleted ? (
              <em className='text-ink-muted'>This comment was deleted.</em>
            ) : (
              <CommentText body={comment.body} />
            )}
          </div>
        ) : null}
        <div className='mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted'>
          {pageLabel ? <span className='rl-num'>{pageLabel}</span> : null}
          {replies.length && !selected ? (
            <span>
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
          ) : null}
          {resolved ? (
            <span className='inline-flex items-center gap-1'>
              <Check aria-hidden className='size-3' />
              Resolved{comment.resolvedByName ? ` by ${comment.resolvedByName}` : ''}
            </span>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className='mt-1.5 pl-[36px]'>
          {editing ? (
            <EditForm
              draftKey={`${scope}:edit:${comment.id}`}
              initial={comment.body}
              onSave={(body) => actions.edit({ id: comment.id, body })}
              onClose={() => setEditing(false)}
            />
          ) : (
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <button
                type='button'
                data-testid='resolve'
                className='inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:underline'
                onClick={() =>
                  actions.setResolved({ id: comment.id, resolved: !resolved })
                }
              >
                {resolved ? (
                  <RotateCcw aria-hidden className='size-3' />
                ) : (
                  <Check aria-hidden className='size-3' />
                )}
                {resolved ? 'Reopen' : 'Resolve'}
              </button>
              {comment.canEdit ? (
                <TextAction onClick={() => setEditing(true)}>Edit</TextAction>
              ) : null}
              {comment.canDelete ? (
                <TextAction onClick={() => actions.remove(comment.id)}>Delete</TextAction>
              ) : null}
            </div>
          )}

          {replies.length ? (
            <ul className='mt-2 border-t pt-1'>
              {replies.map((reply) => (
                <ReplyRow key={reply.id} reply={reply} scope={scope} actions={actions} />
              ))}
            </ul>
          ) : null}

          <ReplyBox
            threadId={comment.id}
            scope={scope}
            canMarkInternal={canMarkInternal}
            forceInternal={comment.internal}
            autoFocus={focusReply}
            onReply={({ body, internal }) =>
              actions.reply({ parentId: comment.id, body, internal })
            }
          />
        </div>
      ) : null}
    </li>
  );
}
