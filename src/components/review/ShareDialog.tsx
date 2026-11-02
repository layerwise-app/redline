import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { timeAgo } from '~/client/format';
import {
  addRecipientFn,
  getShareStateFn,
  issueNewLinkFn,
  removeRecipientFn,
  revokeLinkFn,
  sendShareFn,
  updateLinkFn
} from '~/server/team.functions';
import { redline } from '~/redline.config';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';

const message = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

export function CopyButton({
  value,
  label = 'Copy link',
  testId = 'copy-link',
  variant = 'default'
}: {
  value: string;
  label?: string;
  testId?: string;
  variant?: 'default' | 'outline';
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type='button'
      data-testid={testId}
      variant={variant}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error('Copying was blocked. Select the link and copy it by hand.');
        }
      }}
    >
      {copied ? <Check aria-hidden className='size-3.5' /> : <Copy aria-hidden className='size-3.5' />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function ShareDialog({
  open,
  reviewId,
  onClose
}: {
  open: boolean;
  reviewId: string;
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['share', reviewId];
  const state = useQuery({
    queryKey,
    queryFn: () => getShareStateFn({ data: { reviewId } }),
    enabled: open
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [rowProblem, setRowProblem] = useState<Record<string, string>>({});
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmRevoke(false);
      setLinkError(null);
      setEmailError(null);
    }
  }, [open]);

  const data = state.data;

  const addAddress = useMutation({
    mutationFn: () => addRecipientFn({ data: { reviewId, email } }),
    onSuccess: async () => {
      setEmail('');
      setEmailError(null);
      await refresh();
    },
    onError: (cause) => setEmailError(message(cause, 'That address wasn’t saved.'))
  });

  const send = useMutation({
    mutationFn: (recipientId: string) =>
      sendShareFn({ data: { reviewId, recipientId } }),
    onSuccess: async (result, recipientId) => {
      setRowProblem((current) => {
        const next = { ...current };
        if (result.sent) delete next[recipientId];
        else next[recipientId] = result.message;
        return next;
      });
      await refresh();
    },
    onError: (cause, recipientId) =>
      setRowProblem((current) => ({
        ...current,
        [recipientId]: message(cause, 'The email didn’t go out.')
      }))
  });

  const remove = useMutation({
    mutationFn: (recipientId: string) =>
      removeRecipientFn({ data: { reviewId, recipientId } }),
    onSuccess: refresh
  });

  const link = useMutation({
    mutationFn: (change: {
      password?: string | null;
      expiresAt?: string | null;
      allowDownloads?: boolean;
    }) => updateLinkFn({ data: { reviewId, ...change } }),
    onSuccess: async () => {
      setLinkError(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['review', 'team', reviewId] });
    },
    onError: (cause) => setLinkError(message(cause, 'That didn’t save.'))
  });

  const revoke = useMutation({
    mutationFn: () => revokeLinkFn({ data: { reviewId } }),
    onSuccess: async () => {
      setConfirmRevoke(false);
      await refresh();
    }
  });
  const reissue = useMutation({
    mutationFn: () => issueNewLinkFn({ data: { reviewId } }),
    onSuccess: async () => {
      setConfirmRevoke(false);
      await refresh();
      toast.success('New link issued. The old link no longer works.');
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-lg' data-testid='share-dialog'>
        <DialogHeader>
          <DialogTitle>Share this review</DialogTitle>
          <DialogDescription>
            Anyone with the link can view and comment without an account.
          </DialogDescription>
        </DialogHeader>
        {state.error ? (
          <p role='alert' className='text-sm text-destructive'>
            {message(state.error, 'This couldn’t load.')}
          </p>
        ) : null}
        {data ? (
          <div className='space-y-5'>
            <section className='space-y-2'>
              <div className='flex gap-2'>
                <Input
                  readOnly
                  aria-label='Review link'
                  data-testid='share-url'
                  value={data.url}
                  className='rl-num min-w-0 text-xs'
                  onFocus={(event) => event.currentTarget.select()}
                />
                <CopyButton value={data.url} />
              </div>
              {data.linkState !== 'active' ? (
                <p role='status' data-testid='link-state' className='text-sm text-destructive'>
                  {data.linkState === 'revoked'
                    ? 'This link is revoked. Visitors see a short message and no designs.'
                    : 'This link has expired. Visitors see a short message and no designs.'}
                </p>
              ) : null}
            </section>

            <section className='space-y-2' aria-labelledby='send-heading'>
              <h3 id='send-heading' className='font-medium'>
                Email the link
              </h3>
              <form
                className='flex gap-2'
                onSubmit={(event) => {
                  event.preventDefault();
                  addAddress.mutate();
                }}
              >
                <Input
                  type='email'
                  required
                  aria-label='Client email address'
                  data-testid='recipient-input'
                  placeholder='client@example.com'
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Button
                  type='submit'
                  variant='outline'
                  data-testid='recipient-save'
                  disabled={addAddress.isPending}
                >
                  Save address
                </Button>
              </form>
              {emailError ? (
                <p role='alert' className='text-sm text-destructive'>
                  {emailError}
                </p>
              ) : null}
              {data.recipients.length ? (
                <ul className='divide-y border-y'>
                  {data.recipients.map((recipient) => {
                    const problem = rowProblem[recipient.id] ?? recipient.problem;
                    return (
                      <li key={recipient.id} className='py-2' data-testid='recipient'>
                        <div className='flex items-center gap-2'>
                          <span className='min-w-0 flex-1 truncate'>{recipient.email}</span>
                          <Button
                            type='button'
                            size='sm'
                            data-testid='recipient-send'
                            disabled={send.isPending || data.linkState !== 'active'}
                            onClick={() => send.mutate(recipient.id)}
                          >
                            {recipient.lastSentAt ? 'Send again' : 'Send'}
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            aria-label={`Remove ${recipient.email}`}
                            onClick={() => remove.mutate(recipient.id)}
                          >
                            Remove
                          </Button>
                        </div>
                        {problem ? (
                          <div role='alert' data-testid='recipient-problem' className='mt-1 flex flex-wrap items-center gap-2 text-sm text-destructive'>
                            <span className='min-w-0 flex-1'>{problem}</span>
                            <CopyButton value={data.url} variant='outline' testId='recipient-copy' />
                          </div>
                        ) : recipient.lastSentAt ? (
                          <p className='mt-0.5 text-xs text-ink-muted' suppressHydrationWarning>
                            Sent {timeAgo(recipient.lastSentAt).toLowerCase()}
                          </p>
                        ) : (
                          <p className='mt-0.5 text-xs text-ink-muted'>Not sent yet</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <p className='text-xs text-ink-muted' data-testid='emails-left'>
                {data.clientEmailsLeft} of {redline.email.clientEmailsPerWorkspacePerDay} client emails left today for this workspace.
              </p>
            </section>

            <section className='space-y-3' aria-labelledby='options-heading'>
              <h3 id='options-heading' className='font-medium'>
                Link options
              </h3>
              <div className='flex items-center justify-between gap-3'>
                <Label htmlFor='allow-downloads' className='font-normal'>
                  Allow downloads of original files
                </Label>
                <Switch
                  id='allow-downloads'
                  data-testid='allow-downloads'
                  checked={data.allowDownloads}
                  onCheckedChange={(allowDownloads) => link.mutate({ allowDownloads })}
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='link-expiry' className='font-normal'>
                  Expires on
                </Label>
                <div className='flex gap-2'>
                  <Input
                    id='link-expiry'
                    type='date'
                    data-testid='link-expiry'
                    className='w-44'
                    value={toDateInput(data.expiresAt)}
                    onChange={(event) => {
                      const value = event.target.value;
                      link.mutate({
                        expiresAt: value
                          ? new Date(`${value}T23:59:59`).toISOString()
                          : null
                      });
                    }}
                  />
                  {data.expiresAt ? (
                    <Button type='button' variant='ghost' size='sm' className='self-center' onClick={() => link.mutate({ expiresAt: null })}>
                      No expiry
                    </Button>
                  ) : null}
                </div>
              </div>
              <form
                className='space-y-1'
                onSubmit={(event) => {
                  event.preventDefault();
                  link.mutate({ password });
                  setPassword('');
                }}
              >
                <Label htmlFor='link-password' className='font-normal'>
                  Password {data.hasPassword ? '(on)' : '(off)'}
                </Label>
                <div className='flex gap-2'>
                  <Input
                    id='link-password'
                    data-testid='link-password'
                    type='password'
                    autoComplete='new-password'
                    placeholder={data.hasPassword ? 'Set a new password' : 'Optional'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button type='submit' variant='outline' data-testid='link-password-save' disabled={!password}>
                    Save
                  </Button>
                  {data.hasPassword ? (
                    <Button type='button' variant='ghost' data-testid='link-password-remove' onClick={() => link.mutate({ password: null })}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </form>
              {linkError ? (
                <p role='alert' className='text-sm text-destructive'>
                  {linkError}
                </p>
              ) : null}
            </section>

            <section className='flex flex-wrap items-center gap-2 border-t pt-4'>
              {confirmRevoke ? (
                <>
                  <span className='text-sm'>Revoke this link for everyone?</span>
                  <Button
                    type='button'
                    size='sm'
                    variant='destructive'
                    data-testid='revoke-confirm'
                    onClick={() => revoke.mutate()}
                  >
                    Revoke
                  </Button>
                  <Button type='button' size='sm' variant='ghost' onClick={() => setConfirmRevoke(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <>
                  {data.linkState !== 'revoked' ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      data-testid='revoke-link'
                      onClick={() => setConfirmRevoke(true)}
                    >
                      Revoke link
                    </Button>
                  ) : null}
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    data-testid='new-link'
                    onClick={() => reissue.mutate()}
                  >
                    Issue a new link
                  </Button>
                </>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
