import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TeamApi } from '~/client/api';
import { formatBytes } from '~/domain/files';
import type { WorkspaceSettings } from '~/domain/dto';
import { authClient } from '~/lib/auth-client';
import { isHexColor, readableOn } from '~/lib/redline/color';
import { redline } from '~/redline.config';
import {
  createInviteFn,
  deleteWorkspaceFn,
  leaveWorkspaceFn,
  removeLogoFn,
  removeMemberFn,
  revokeInviteFn
} from '~/server/team.functions';
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
import { Progress } from '~/components/ui/progress';
import { CopyButton } from '~/components/review/ShareDialog';

const message = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

function Section({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='grid gap-3 border-t py-6 md:grid-cols-[220px_1fr] md:gap-8'>
      <div>
        <h2 className='font-medium'>{title}</h2>
        {description ? <p className='mt-1 text-ink-muted'>{description}</p> : null}
      </div>
      <div className='min-w-0'>{children}</div>
    </section>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  matchText,
  matchLabel,
  needPassword,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  matchText?: string;
  matchLabel?: string;
  needPassword?: boolean;
  onClose(): void;
  onConfirm(password: string): Promise<unknown>;
}) {
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready =
    (!matchText || typed === matchText) && (!needPassword || password.length > 0);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <form
          className='space-y-4'
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onConfirm(password);
            } catch (cause) {
              setError(message(cause, 'That didn’t work.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {matchText ? (
            <div className='space-y-1.5'>
              <Label htmlFor='confirm-text'>{matchLabel}</Label>
              <Input
                id='confirm-text'
                data-testid='confirm-text'
                autoComplete='off'
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          ) : null}
          {needPassword ? (
            <div className='space-y-1.5'>
              <Label htmlFor='confirm-password'>Your password</Label>
              <Input
                id='confirm-password'
                data-testid='confirm-password'
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          ) : null}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' variant='destructive' data-testid='confirm-delete' disabled={!ready || busy}>
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BrandSection({
  api,
  settings,
  refresh
}: {
  api: TeamApi;
  settings: WorkspaceSettings;
  refresh(): Promise<unknown>;
}) {
  const canEdit = settings.role === 'owner';
  const [name, setName] = useState(settings.name);
  const [accent, setAccent] = useState(settings.accentColor);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isServer = api.scope === 'server';
  useEffect(() => {
    setName(settings.name);
    setAccent(settings.accentColor);
  }, [settings.name, settings.accentColor]);

  const save = useMutation({
    mutationFn: () =>
      api.updateWorkspace({
        workspaceId: settings.id,
        name,
        accentColor: accent.toUpperCase()
      }),
    onSuccess: async () => {
      setError(null);
      toast.success('Workspace saved.');
      await refresh();
    },
    onError: (cause) => setError(message(cause, 'That didn’t save.'))
  });

  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const response = await fetch(
        `/api/uploads/logo?workspaceId=${encodeURIComponent(settings.id)}`,
        { method: 'POST', body: file }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'The logo didn’t upload.');
      }
      await refresh();
    } catch (cause) {
      setLogoError(message(cause, 'The logo didn’t upload.'));
    } finally {
      setLogoBusy(false);
    }
  };

  const valid = isHexColor(accent);
  return (
    <Section title='Workspace' description='Shown to clients on your review pages.'>
      <form
        className='max-w-md space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className='space-y-1.5'>
          <Label htmlFor='workspace-name'>Name</Label>
          <Input
            id='workspace-name'
            data-testid='workspace-name'
            disabled={!canEdit}
            maxLength={redline.limits.workspaceNameMaxLength}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='workspace-accent'>Accent color</Label>
          <div className='flex items-center gap-2'>
            <input
              type='color'
              aria-label='Pick an accent color'
              disabled={!canEdit}
              value={valid ? accent : redline.colors.accent}
              className='h-9 w-10 cursor-pointer rounded border border-input bg-paper p-0.5'
              onChange={(event) => setAccent(event.target.value.toUpperCase())}
            />
            <Input
              id='workspace-accent'
              data-testid='workspace-accent'
              disabled={!canEdit}
              className='rl-num w-28'
              aria-invalid={!valid}
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
            />
            <span
              className='rl-pin rl-pin-inline'
              style={
                valid
                  ? { background: accent, color: readableOn(accent), cursor: 'default' }
                  : { cursor: 'default' }
              }
              aria-label='Pin preview'
              role='img'
            >
              1
            </span>
          </div>
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        {canEdit ? (
          <Button type='submit' size='sm' data-testid='workspace-save' disabled={!valid || save.isPending}>
            Save
          </Button>
        ) : (
          <p className='text-ink-muted'>Only the owner can change these.</p>
        )}
      </form>
      <div className='mt-6 max-w-md space-y-2'>
        <p className='font-medium'>Logo</p>
        <div className='flex items-center gap-3'>
          <div className='flex size-14 items-center justify-center rounded border bg-wash'>
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={`${settings.name} logo`}
                data-testid='workspace-logo'
                className='max-h-12 max-w-12 object-contain'
              />
            ) : (
              <span className='text-xs text-ink-muted'>None</span>
            )}
          </div>
          {canEdit && isServer ? (
            <>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={logoBusy}
                onClick={() => inputRef.current?.click()}
              >
                {logoBusy ? 'Uploading…' : 'Upload'}
              </Button>
              {settings.logoUrl ? (
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={async () => {
                    await removeLogoFn({ data: { workspaceId: settings.id } });
                    await refresh();
                  }}
                >
                  Remove
                </Button>
              ) : null}
              <input
                ref={inputRef}
                data-testid='logo-input'
                type='file'
                accept='image/png,image/jpeg,image/webp'
                className='sr-only'
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadLogo(file);
                }}
              />
            </>
          ) : null}
        </div>
        <p className='text-xs text-ink-muted'>PNG, JPG, or WebP, up to 2 MB. No SVG.</p>
        {logoError ? (
          <p role='alert' className='text-sm text-destructive'>
            {logoError}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function StorageSection({ settings }: { settings: WorkspaceSettings }) {
  const percent = Math.min(100, (settings.usedBytes / settings.limitBytes) * 100);
  return (
    <Section title='Storage'>
      <div className='max-w-md space-y-2' data-testid='storage'>
        <p className='rl-num'>
          {formatBytes(settings.usedBytes)} of {formatBytes(settings.limitBytes)} used
        </p>
        <Progress value={percent} aria-label='Storage used' />
        <p className='text-ink-muted'>
          Files can be up to {formatBytes(settings.maxFileBytes)}, and PDFs up to {redline.limits.maxPdfPages} pages.
        </p>
        {settings.storageReadOnly ? (
          <p role='status' className='text-sm text-destructive'>
            File storage is read-only because the project is over its quota. Existing reviews keep working, but uploads are paused.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function MembersSection({
  api,
  settings,
  refresh
}: {
  api: TeamApi;
  settings: WorkspaceSettings;
  refresh(): Promise<unknown>;
}) {
  const isOwner = settings.role === 'owner';
  const isServer = api.scope === 'server';
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ url: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (address: string | null) =>
      createInviteFn({ data: { workspaceId: settings.id, email: address } }),
    onSuccess: async (result, address) => {
      setError(null);
      setEmail('');
      setCreated({
        url: result.url,
        note: address
          ? result.emailResult?.sent
            ? `Emailed to ${address}. Only that address can accept it.`
            : `${address}: ${result.emailResult && !result.emailResult.sent ? result.emailResult.message : 'not sent.'} Only that address can accept this link.`
          : 'Anyone with this link can join, once. It won’t be shown again.'
      });
      await refresh();
    },
    onError: (cause) => setError(message(cause, 'The invitation didn’t go through.'))
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      removeMemberFn({ data: { workspaceId: settings.id, userId } }),
    onSuccess: refresh,
    onError: (cause) => toast.error(message(cause, 'That didn’t work.'))
  });
  const revoke = useMutation({
    mutationFn: (inviteId: string) =>
      revokeInviteFn({ data: { workspaceId: settings.id, inviteId } }),
    onSuccess: refresh
  });

  return (
    <Section
      title='Team'
      description='Invitations expire in 7 days and work once.'
    >
      <ul className='divide-y border-y' data-testid='members'>
        {settings.members.map((member) => (
          <li key={member.userId} data-testid='member' className='flex items-center gap-3 py-2'>
            <div className='min-w-0 flex-1'>
              <p className='truncate font-medium'>
                {member.name}
                {member.isYou ? <span className='font-normal text-ink-muted'> (you)</span> : null}
              </p>
              <p className='truncate text-xs text-ink-muted'>{member.email}</p>
            </div>
            <span className='text-xs text-ink-muted capitalize'>{member.role}</span>
            {isOwner && isServer && member.role === 'member' ? (
              <Button
                size='sm'
                variant='ghost'
                data-testid='remove-member'
                onClick={() => remove.mutate(member.userId)}
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {isOwner && !isServer ? (
        <p className='mt-3 text-ink-muted'>Invitations are off in Try mode: no real links get created.</p>
      ) : null}

      {isOwner && isServer ? (
        <div className='mt-4 space-y-3'>
          <form
            className='flex max-w-md flex-wrap gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate(email);
            }}
          >
            <Input
              type='email'
              required
              aria-label='Teammate’s email'
              data-testid='invite-email'
              placeholder='teammate@example.com'
              className='min-w-0 flex-1'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type='submit' variant='outline' data-testid='invite-send' disabled={invite.isPending}>
              Invite
            </Button>
            <Button
              type='button'
              variant='ghost'
              data-testid='invite-link'
              disabled={invite.isPending}
              onClick={() => invite.mutate(null)}
            >
              Create a link
            </Button>
          </form>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          {created ? (
            <div className='max-w-md space-y-1.5 rounded border p-3' data-testid='invite-created'>
              <div className='flex gap-2'>
                <Input
                  readOnly
                  aria-label='Invitation link'
                  data-testid='invite-url'
                  className='rl-num min-w-0 text-xs'
                  value={created.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <CopyButton value={created.url} testId='invite-copy' />
              </div>
              <p className='text-xs text-ink-muted'>{created.note}</p>
            </div>
          ) : null}
          {settings.invites.length ? (
            <div>
              <p className='mb-1 text-xs text-ink-muted'>Pending invitations</p>
              <ul className='divide-y border-y' data-testid='pending-invites'>
                {settings.invites.map((pending) => (
                  <li key={pending.id} className='flex items-center gap-3 py-2'>
                    <span className='min-w-0 flex-1 truncate'>{pending.email ?? 'Link invitation'}</span>
                    <span className='rl-num text-xs text-ink-muted' suppressHydrationWarning>
                      Expires {new Date(pending.expiresAt).toLocaleDateString()}
                    </span>
                    <Button size='sm' variant='ghost' onClick={() => revoke.mutate(pending.id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function DangerSection({
  settings,
  refresh
}: {
  settings: WorkspaceSettings;
  refresh(): Promise<unknown>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<null | 'workspace' | 'leave' | 'account'>(null);
  const isOwner = settings.role === 'owner';
  return (
    <Section title='Danger zone'>
      <div className='max-w-md space-y-4'>
        {isOwner ? (
          <div>
            <p className='mb-1.5 text-ink-muted'>
              Deleting this workspace removes its reviews, comments, and every stored file.
            </p>
            <Button variant='outline' size='sm' data-testid='delete-workspace' onClick={() => setDialog('workspace')}>
              Delete workspace
            </Button>
          </div>
        ) : (
          <div>
            <p className='mb-1.5 text-ink-muted'>Leave this workspace. Your comments stay.</p>
            <Button variant='outline' size='sm' data-testid='leave-workspace' onClick={() => setDialog('leave')}>
              Leave workspace
            </Button>
          </div>
        )}
        <div>
          <p className='mb-1.5 text-ink-muted'>
            Deleting your account removes workspaces you own alone, with their files. A workspace with other members passes to the longest-standing one.
          </p>
          <Button variant='outline' size='sm' data-testid='delete-account' onClick={() => setDialog('account')}>
            Delete account
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'workspace'}
        title={`Delete ${settings.name}?`}
        description='This removes all of its reviews, comments, and stored files. It can’t be undone.'
        confirmLabel='Delete workspace'
        matchText={settings.name}
        matchLabel={`Type “${settings.name}” to confirm`}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await deleteWorkspaceFn({ data: { workspaceId: settings.id } });
          setDialog(null);
          await queryClient.invalidateQueries();
          await navigate({ to: '/dashboard' });
        }}
      />
      <ConfirmDialog
        open={dialog === 'leave'}
        title={`Leave ${settings.name}?`}
        description='You’ll lose access to its reviews unless you’re invited again.'
        confirmLabel='Leave workspace'
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await leaveWorkspaceFn({ data: { workspaceId: settings.id } });
          setDialog(null);
          await queryClient.invalidateQueries();
          await refresh();
          await navigate({ to: '/dashboard' });
        }}
      />
      <ConfirmDialog
        open={dialog === 'account'}
        title='Delete your account?'
        description='This can’t be undone.'
        confirmLabel='Delete account'
        needPassword
        onClose={() => setDialog(null)}
        onConfirm={async (password) => {
          const { error } = await authClient.deleteUser({ password });
          if (error) throw new Error(error.message ?? 'That didn’t work.');
          queryClient.clear();
          await navigate({ to: '/' });
        }}
      />
    </Section>
  );
}

export function SettingsView({ api }: { api: TeamApi }) {
  const queryClient = useQueryClient();
  const queryKey = ['settings', api.scope];
  const settings = useQuery({ queryKey, queryFn: api.getSettings });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ['shell', api.scope] });
  };
  const data = settings.data;
  return (
    <div data-testid='settings' className='max-w-4xl'>
      <h1 className='mb-5 text-xl font-semibold tracking-tight'>Settings</h1>
      {data ? (
        <>
          <BrandSection api={api} settings={data} refresh={refresh} />
          <StorageSection settings={data} />
          <MembersSection api={api} settings={data} refresh={refresh} />
          {api.scope === 'server' ? <DangerSection settings={data} refresh={refresh} /> : null}
        </>
      ) : null}
      {settings.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {message(settings.error, 'Settings couldn’t load.')}
        </p>
      ) : null}
    </div>
  );
}
