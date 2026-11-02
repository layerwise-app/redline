import { useState } from 'react';
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
import { Textarea } from '~/components/ui/textarea';
import { redline } from '~/redline.config';

export function IdentityDialog({
  open,
  title,
  initialName = '',
  initialEmail = '',
  onClose,
  onSave
}: {
  open: boolean;
  title: string;
  initialName?: string;
  initialEmail?: string;
  onClose(): void;
  onSave(input: { name: string; email: string | null }): Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-sm'>
        <form
          className='space-y-4'
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onSave({ name, email: email.trim() || null });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'That didn’t save.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              The team sees this name beside your comments and decisions.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='guest-name'>Your name</Label>
            <Input
              id='guest-name'
              required
              autoFocus
              autoComplete='name'
              maxLength={redline.limits.guestNameMaxLength}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='guest-email'>Email me when the team replies</Label>
            <Input
              id='guest-email'
              type='email'
              autoComplete='email'
              placeholder='Optional'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='submit' disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Continue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abuse or harassment' },
  { value: 'copyright', label: 'Copyright' },
  { value: 'malware', label: 'Phishing or malware' },
  { value: 'other', label: 'Something else' }
];

export function ReportDialog({
  open,
  onClose,
  onSubmit
}: {
  open: boolean;
  onClose(): void;
  onSubmit(input: { reason: string; details: string }): Promise<unknown>;
}) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setDone(false);
        }
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Report this page</DialogTitle>
          <DialogDescription>
            {done
              ? 'Thanks. Your report was saved for review.'
              : 'Tell us what’s wrong with this page. Reports go to the people who run this site, not to the team who shared it.'}
          </DialogDescription>
        </DialogHeader>
        {done ? null : (
          <form
            className='space-y-4'
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await onSubmit({ reason, details });
                setDone(true);
                setDetails('');
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'That didn’t send.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className='space-y-1.5'>
              <Label htmlFor='report-reason'>Reason</Label>
              <select
                id='report-reason'
                className='h-9 w-full rounded border border-input bg-paper px-2 text-sm'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='report-details'>Details</Label>
              <Textarea
                id='report-details'
                rows={4}
                maxLength={redline.limits.reportMaxLength}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </div>
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type='submit' disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
