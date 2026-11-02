import { eq, asc, and } from 'drizzle-orm';
import { emailLog, reviews, user, workspaceMembers } from '~/db/schema';
import type { EmailErrorCode } from '~/lib/email';
import { redline } from '~/redline.config';
import type { Ctx } from './context';
import type { RenderedEmail } from './email-templates';
import { consumeDaily, refund } from './rate-limit';

export type EmailKind =
  | 'share'
  | 'reply'
  | 'new_version'
  | 'feedback'
  | 'decision'
  | 'first_comment'
  | 'invite';

export type EmailCode = EmailErrorCode | 'workspace_limit' | 'exception';
export type EmailResult = { sent: true } | { sent: false; code: EmailCode; message: string };

export const CLIENT_LIMIT_MESSAGE = `Daily limit reached: this workspace has sent ${redline.email.clientEmailsPerWorkspacePerDay} client emails today. Nothing was sent. Copy link still works.`;

export function emailErrorMessage(code: EmailCode): string {
  switch (code) {
    case 'workspace_limit':
      return CLIENT_LIMIT_MESSAGE;
    case 'unsubscribed':
      return 'This person unsubscribed from this app’s email. Use Copy link instead.';
    case 'suppressed':
      return 'This address can’t receive email after an earlier bounce or spam report. Ask for another address or use Copy link.';
    case 'recipient_limit_reached':
      return 'This address has had 20 emails from this app today. Try tomorrow or use Copy link.';
    case 'daily_limit_reached':
    case 'team_daily_limit_reached':
      return 'The app’s daily email limit is used up. It resets at midnight; until then, use Copy link.';
    case 'paused':
      return 'Email is paused for this app because of bounces or spam reports. Use Copy link.';
    case 'not_published':
      return 'Email starts working once the app is published. Use Copy link until then.';
    case 'invalid_message':
    case 'send_failed':
    case 'exception':
      return 'The email didn’t go out. Try again later or use Copy link.';
  }
}

/** The single way email leaves the app. Never throws, and every send is logged. */
export async function sendEmail(
  ctx: Ctx,
  meta: {
    workspaceId: string;
    reviewId: string | null;
    kind: EmailKind;
    to: string;
  },
  message: RenderedEmail
): Promise<EmailResult> {
  let result: EmailResult;
  try {
    const { error } = await ctx.email.send({ to: meta.to, ...message });
    if (error) {
      console.warn(`[email] ${meta.kind}: ${error.code} ${error.message}`);
      result = {
        sent: false,
        code: error.code,
        message: emailErrorMessage(error.code)
      };
    } else {
      result = { sent: true };
    }
  } catch (error) {
    console.warn(`[email] ${meta.kind}: threw`, error);
    result = {
      sent: false,
      code: 'exception',
      message: emailErrorMessage('exception')
    };
  }
  try {
    await ctx.db.insert(emailLog).values({
      workspaceId: meta.workspaceId,
      reviewId: meta.reviewId,
      kind: meta.kind,
      recipient: meta.to,
      status: result.sent ? 'sent' : result.code,
      createdAt: ctx.now()
    });
  } catch (error) {
    console.warn('[email] log failed', error);
  }
  return result;
}

const clientBudgetKey = (workspaceId: string) => `email:client:${workspaceId}`;

/** Email to a client: counts against the workspace's daily client budget. */
export async function sendClientEmail(
  ctx: Ctx,
  meta: {
    workspaceId: string;
    reviewId: string;
    kind: 'share' | 'reply' | 'new_version';
    to: string;
  },
  message: RenderedEmail
): Promise<EmailResult> {
  const key = clientBudgetKey(meta.workspaceId);
  let allowed = false;
  try {
    allowed = await consumeDaily(
      ctx,
      key,
      redline.email.clientEmailsPerWorkspacePerDay
    );
  } catch (error) {
    console.warn('[email] budget check failed', error);
    return { sent: false, code: 'exception', message: emailErrorMessage('exception') };
  }
  if (!allowed) {
    return {
      sent: false,
      code: 'workspace_limit',
      message: CLIENT_LIMIT_MESSAGE
    };
  }
  const result = await sendEmail(ctx, meta, message);
  // Mail that never left shouldn't use up the budget.
  if (!result.sent) await refund(ctx, key).catch(() => undefined);
  return result;
}

/**
 * Email to a review's creator, triggered by a guest. The address always comes
 * from our own records: the creator, or the owner if the creator has left.
 */
export async function sendToReviewCreator(
  ctx: Ctx,
  meta: {
    workspaceId: string;
    reviewId: string;
    kind: 'feedback' | 'decision' | 'first_comment';
  },
  message: RenderedEmail
): Promise<EmailResult> {
  try {
    const allowed = await consumeDaily(
      ctx,
      `email:creator:${meta.reviewId}`,
      redline.email.creatorEmailsPerReviewPerDay
    );
    if (!allowed) {
      return { sent: false, code: 'workspace_limit', message: CLIENT_LIMIT_MESSAGE };
    }
    const [creator] = await ctx.db
      .select({ email: user.email })
      .from(reviews)
      .innerJoin(user, eq(user.id, reviews.createdById))
      .where(eq(reviews.id, meta.reviewId))
      .limit(1);
    const to =
      creator?.email ??
      (
        await ctx.db
          .select({ email: user.email })
          .from(workspaceMembers)
          .innerJoin(user, eq(user.id, workspaceMembers.userId))
          .where(
            and(
              eq(workspaceMembers.workspaceId, meta.workspaceId),
              eq(workspaceMembers.role, 'owner')
            )
          )
          .orderBy(asc(workspaceMembers.createdAt))
          .limit(1)
      )[0]?.email;
    if (!to) {
      return { sent: false, code: 'exception', message: emailErrorMessage('exception') };
    }
    return await sendEmail(ctx, { ...meta, to }, message);
  } catch (error) {
    console.warn('[email] creator send failed', error);
    return { sent: false, code: 'exception', message: emailErrorMessage('exception') };
  }
}
