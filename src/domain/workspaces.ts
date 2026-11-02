import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  pages,
  user,
  versions,
  workspaceInvites,
  workspaceMembers,
  workspaces
} from '~/db/schema';
import { redline } from '~/redline.config';
import { getStorageErrorCode } from '~/lib/storage';
import {
  activeWorkspaceId,
  requireMember,
  requireOwner
} from './access';
import type { Actor, Ctx } from './context';
import { randomToken, sha256 } from './crypto';
import type { InviteDTO, WorkspaceSettings, WorkspaceSummary } from './dto';
import { sendEmail, type EmailResult } from './email';
import { inviteEmail } from './email-templates';
import { AppError, notFound } from './errors';
import {
  checkUpload,
  maxFileBytes,
  parseImageSize,
  sniffFileType,
  STORAGE_READ_ONLY_MESSAGE
} from './files';
import { consumeDaily } from './rate-limit';
import * as v from './validate';

export const storageErrorMessage = (error: unknown): AppError | null => {
  const code = getStorageErrorCode(error);
  if (code === 'StorageQuotaExceeded') {
    return new AppError(STORAGE_READ_ONLY_MESSAGE, code, 507);
  }
  if (code === 'FileTooLarge') {
    return new AppError(
      'This file is over the limit Storage allows per file on this plan.',
      code,
      413
    );
  }
  if (code === 'BlockedContent') {
    return new AppError('This file was rejected by abuse checks.', code, 422);
  }
  return null;
};

export async function listWorkspaces(
  ctx: Ctx,
  actor: Actor
): Promise<{ user: Actor; workspaces: WorkspaceSummary[]; activeId: string }> {
  const activeId = await activeWorkspaceId(ctx, actor);
  const rows = await ctx.db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, actor.id))
    .orderBy(asc(workspaces.name));
  return {
    user: { id: actor.id, name: actor.name, email: actor.email },
    workspaces: rows.map((row) => ({ ...row, active: row.id === activeId })),
    activeId
  };
}

export async function switchWorkspace(ctx: Ctx, actor: Actor, workspaceId: string) {
  await requireMember(ctx, actor, workspaceId);
  await ctx.db
    .update(workspaceMembers)
    .set({ lastActiveAt: ctx.now() })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    );
}

/** Bytes held for this workspace, including uploads still in progress. */
export async function workspaceUsedBytes(ctx: Ctx, workspaceId: string) {
  const [originals] = await ctx.db
    .select({ total: sql<number>`COALESCE(SUM(${versions.originalSize}), 0)` })
    .from(versions)
    .where(eq(versions.workspaceId, workspaceId));
  const [previews] = await ctx.db
    .select({ total: sql<number>`COALESCE(SUM(${pages.previewSize}), 0)` })
    .from(pages)
    .where(eq(pages.workspaceId, workspaceId));
  const [workspace] = await ctx.db
    .select({ logoSize: workspaces.logoSize })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return (
    Number(originals?.total ?? 0) +
    Number(previews?.total ?? 0) +
    (workspace?.logoSize ?? 0)
  );
}

export async function getSettings(
  ctx: Ctx,
  actor: Actor
): Promise<WorkspaceSettings> {
  const workspaceId = await activeWorkspaceId(ctx, actor);
  const membership = await requireMember(ctx, actor, workspaceId);
  const [workspace] = await ctx.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) throw notFound();

  const members = await ctx.db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      name: user.name,
      email: user.email
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));

  const invites =
    membership.role === 'owner' ? await listInvites(ctx, actor, workspaceId) : [];
  const usage = await ctx.storage.usage();

  return {
    id: workspace.id,
    name: workspace.name,
    accentColor: workspace.accentColor,
    logoUrl: workspace.logoKey ? `/api/media/logo/${workspace.id}` : null,
    role: membership.role,
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      isYou: m.userId === actor.id
    })),
    invites,
    usedBytes: await workspaceUsedBytes(ctx, workspaceId),
    limitBytes: redline.limits.workspaceStorageBytes,
    maxFileBytes: maxFileBytes(usage),
    storageReadOnly: usage.readOnly
  };
}

export async function updateWorkspace(
  ctx: Ctx,
  actor: Actor,
  input: { workspaceId: string; name: string; accentColor: string }
) {
  await requireOwner(ctx, actor, input.workspaceId);
  await ctx.db
    .update(workspaces)
    .set({
      name: v.parse(v.workspaceName, input.name),
      accentColor: v.parse(v.accentColor, input.accentColor)
    })
    .where(eq(workspaces.id, input.workspaceId));
}

export async function setLogo(
  ctx: Ctx,
  actor: Actor,
  input: { workspaceId: string; bytes: Uint8Array }
) {
  await requireOwner(ctx, actor, input.workspaceId);
  const { bytes, workspaceId } = input;
  const type = sniffFileType(bytes);
  if (type === 'svg') {
    throw new AppError('SVG logos aren’t accepted. Use a PNG, JPG, or WebP file.');
  }
  if (type !== 'png' && type !== 'jpeg' && type !== 'webp') {
    throw new AppError('Use a PNG, JPG, or WebP file for the logo.');
  }
  if (bytes.byteLength > redline.limits.logoMaxBytes) {
    throw new AppError('Logos can be up to 2 MB.');
  }
  if (!parseImageSize(bytes)) throw new AppError('That image can’t be read.');
  const usage = await ctx.storage.usage();
  const refusal = checkUpload({
    size: bytes.byteLength,
    usedBytes: await workspaceUsedBytes(ctx, workspaceId),
    usage
  });
  if (refusal) throw new AppError(refusal.message, refusal.code, 413);

  const [workspace] = await ctx.db
    .select({ logoKey: workspaces.logoKey })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const key = `workspaces/${workspaceId}/logo/${crypto.randomUUID()}`;
  try {
    await ctx.storage.put(key, bytes, { contentType: `image/${type}` });
  } catch (error) {
    throw storageErrorMessage(error) ?? error;
  }
  await ctx.db
    .update(workspaces)
    .set({ logoKey: key, logoSize: bytes.byteLength })
    .where(eq(workspaces.id, workspaceId));
  if (workspace?.logoKey) await ctx.storage.delete(workspace.logoKey);
}

export async function removeLogo(ctx: Ctx, actor: Actor, workspaceId: string) {
  await requireOwner(ctx, actor, workspaceId);
  const [workspace] = await ctx.db
    .select({ logoKey: workspaces.logoKey })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  await ctx.db
    .update(workspaces)
    .set({ logoKey: null, logoSize: 0 })
    .where(eq(workspaces.id, workspaceId));
  if (workspace?.logoKey) await ctx.storage.delete(workspace.logoKey);
}

export async function getLogoObject(
  ctx: Ctx,
  actor: Actor,
  workspaceId: string
) {
  await requireMember(ctx, actor, workspaceId);
  const [workspace] = await ctx.db
    .select({ logoKey: workspaces.logoKey })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace?.logoKey) throw notFound();
  return workspace.logoKey;
}

// Invites

export async function listInvites(
  ctx: Ctx,
  actor: Actor,
  workspaceId: string
): Promise<InviteDTO[]> {
  await requireOwner(ctx, actor, workspaceId);
  const rows = await ctx.db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      expiresAt: workspaceInvites.expiresAt,
      createdAt: workspaceInvites.createdAt
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt),
        isNull(workspaceInvites.revokedAt),
        gt(workspaceInvites.expiresAt, ctx.now())
      )
    )
    .orderBy(desc(workspaceInvites.createdAt));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  }));
}

/**
 * Creates a one-use invitation. The link is returned once, here: only its hash
 * is stored, so nobody can read a pending invite's link back from the database.
 */
export async function createInvite(
  ctx: Ctx,
  actor: Actor,
  input: { workspaceId: string; email?: string | null }
): Promise<{ url: string; emailResult: EmailResult | null }> {
  await requireOwner(ctx, actor, input.workspaceId);
  const email = input.email ? v.parse(v.email, input.email) : null;
  const now = ctx.now();
  const token = randomToken();
  await ctx.db.insert(workspaceInvites).values({
    workspaceId: input.workspaceId,
    tokenHash: await sha256(token),
    email,
    createdById: actor.id,
    expiresAt: new Date(now.getTime() + redline.limits.inviteLifetimeMs),
    createdAt: now
  });
  const url = `${ctx.appUrl}/invite/${token}`;
  if (!email) return { url, emailResult: null };

  const [workspace] = await ctx.db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId));
  const allowed = await consumeDaily(
    ctx,
    `email:invite:${input.workspaceId}`,
    redline.email.inviteEmailsPerWorkspacePerDay
  ).catch(() => false);
  if (!allowed) {
    return {
      url,
      emailResult: {
        sent: false,
        code: 'workspace_limit',
        message: `This workspace has sent ${redline.email.inviteEmailsPerWorkspacePerDay} invitations today. Copy the link instead.`
      }
    };
  }
  const emailResult = await sendEmail(
    ctx,
    {
      workspaceId: input.workspaceId,
      reviewId: null,
      kind: 'invite',
      to: email
    },
    inviteEmail({
      inviter: actor.name,
      workspace: workspace?.name ?? 'a workspace',
      url
    })
  );
  return { url, emailResult };
}

export async function revokeInvite(
  ctx: Ctx,
  actor: Actor,
  input: { workspaceId: string; inviteId: string }
) {
  await requireOwner(ctx, actor, input.workspaceId);
  const rows = await ctx.db
    .update(workspaceInvites)
    .set({ revokedAt: ctx.now() })
    .where(
      and(
        eq(workspaceInvites.id, input.inviteId),
        eq(workspaceInvites.workspaceId, input.workspaceId)
      )
    )
    .returning({ id: workspaceInvites.id });
  if (!rows.length) throw notFound();
}

export type InvitePreview =
  | { state: 'valid'; workspaceName: string; email: string | null }
  | { state: 'unavailable' };

/** Used, revoked, expired, and unknown all read the same to the person holding it. */
export async function previewInvite(
  ctx: Ctx,
  token: string
): Promise<InvitePreview> {
  const [row] = await ctx.db
    .select({
      workspaceName: workspaces.name,
      email: workspaceInvites.email,
      expiresAt: workspaceInvites.expiresAt,
      acceptedAt: workspaceInvites.acceptedAt,
      revokedAt: workspaceInvites.revokedAt
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .where(eq(workspaceInvites.tokenHash, await sha256(token)))
    .limit(1);
  if (
    !row ||
    row.acceptedAt ||
    row.revokedAt ||
    row.expiresAt.getTime() <= ctx.now().getTime()
  ) {
    return { state: 'unavailable' };
  }
  return { state: 'valid', workspaceName: row.workspaceName, email: row.email };
}

const INVITE_GONE =
  'This invitation has expired, been revoked, or already been used. Ask for a new one.';

export async function acceptInvite(ctx: Ctx, actor: Actor, token: string) {
  const tokenHash = await sha256(token);
  const [invite] = await ctx.db
    .select({
      id: workspaceInvites.id,
      workspaceId: workspaceInvites.workspaceId,
      email: workspaceInvites.email
    })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.tokenHash, tokenHash))
    .limit(1);
  if (!invite) throw new AppError(INVITE_GONE, 'invite_gone', 410);
  if (invite.email && invite.email !== actor.email.toLowerCase()) {
    throw new AppError(
      `This invitation is for ${invite.email}. Sign in with that address to accept it.`,
      'invite_email',
      403
    );
  }
  const [existing] = await ctx.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, invite.workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    );
  const now = ctx.now();
  if (!existing) {
    // The conditional update is what makes the link single use, even in a race.
    const claimed = await ctx.db
      .update(workspaceInvites)
      .set({ acceptedAt: now, acceptedById: actor.id })
      .where(
        and(
          eq(workspaceInvites.id, invite.id),
          isNull(workspaceInvites.acceptedAt),
          isNull(workspaceInvites.revokedAt),
          gt(workspaceInvites.expiresAt, now)
        )
      )
      .returning({ id: workspaceInvites.id });
    if (!claimed.length) throw new AppError(INVITE_GONE, 'invite_gone', 410);
    await ctx.db.insert(workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId: actor.id,
      role: 'member',
      lastActiveAt: now,
      createdAt: now
    });
  } else {
    await switchWorkspace(ctx, actor, invite.workspaceId);
  }
  return { workspaceId: invite.workspaceId, alreadyMember: Boolean(existing) };
}

// Members

export async function removeMember(
  ctx: Ctx,
  actor: Actor,
  input: { workspaceId: string; userId: string }
) {
  await requireOwner(ctx, actor, input.workspaceId);
  if (input.userId === actor.id) {
    throw new AppError('You can’t remove yourself. Delete the workspace instead.');
  }
  const removed = await ctx.db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, input.userId),
        eq(workspaceMembers.role, 'member')
      )
    )
    .returning({ userId: workspaceMembers.userId });
  if (!removed.length) throw notFound();
}

export async function leaveWorkspace(ctx: Ctx, actor: Actor, workspaceId: string) {
  const membership = await requireMember(ctx, actor, workspaceId);
  if (membership.role === 'owner') {
    throw new AppError('The owner can’t leave. Delete the workspace instead.');
  }
  await ctx.db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    );
}

// Deleting

/** Every Storage key that belongs to a workspace. */
export async function workspaceStorageKeys(ctx: Ctx, workspaceId: string) {
  const originals = await ctx.db
    .select({ key: versions.originalKey })
    .from(versions)
    .where(eq(versions.workspaceId, workspaceId));
  const previews = await ctx.db
    .select({ key: pages.previewKey })
    .from(pages)
    .where(eq(pages.workspaceId, workspaceId));
  const [workspace] = await ctx.db
    .select({ logoKey: workspaces.logoKey })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return [
    ...originals.map((row) => row.key),
    ...previews.map((row) => row.key),
    ...(workspace?.logoKey ? [workspace.logoKey] : [])
  ];
}

export async function deleteKeys(ctx: Ctx, keys: string[]) {
  for (let i = 0; i < keys.length; i += 500) {
    await ctx.storage.delete(keys.slice(i, i + 500));
  }
}

async function destroyWorkspace(ctx: Ctx, workspaceId: string) {
  // Files first: if Storage fails, the rows survive to retry from.
  await deleteKeys(ctx, await workspaceStorageKeys(ctx, workspaceId));
  await ctx.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function deleteWorkspace(ctx: Ctx, actor: Actor, workspaceId: string) {
  await requireOwner(ctx, actor, workspaceId);
  await destroyWorkspace(ctx, workspaceId);
}

/**
 * Runs before an account is deleted. A workspace the person owns alone is deleted
 * with its files. If teammates remain, the longest-standing one becomes owner, so
 * one person leaving doesn't delete the team's work.
 */
export async function prepareAccountDeletion(ctx: Ctx, userId: string) {
  const owned = await ctx.db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'owner'))
    );
  for (const { workspaceId } of owned) {
    const others = await ctx.db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          ne(workspaceMembers.userId, userId)
        )
      )
      .orderBy(asc(workspaceMembers.createdAt));
    const heir = others[0];
    if (!heir) {
      await destroyWorkspace(ctx, workspaceId);
    } else if (!others.some((other) => other.role === 'owner')) {
      await ctx.db
        .update(workspaceMembers)
        .set({ role: 'owner' })
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.userId, [heir.userId])
          )
        );
    }
  }
}
