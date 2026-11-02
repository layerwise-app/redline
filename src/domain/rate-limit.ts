import { eq, lt, sql } from 'drizzle-orm';
import { emailThrottles, rateLimits } from '~/db/schema';
import type { Ctx } from './context';
import { sha256 } from './crypto';

export type Window = { limit: number; windowMs: number };

/** Atomically take one unit from a counter. False means the limit is used up. */
async function take(ctx: Ctx, key: string, limit: number, resetAt: number) {
  const now = ctx.now().getTime();
  const rows = await ctx.db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN excluded.reset_at ELSE ${rateLimits.resetAt} END`
      },
      where: sql`${rateLimits.resetAt} <= ${now} OR ${rateLimits.count} < ${limit}`
    })
    .returning({ count: rateLimits.count });
  return rows.length > 0;
}

export async function consume(ctx: Ctx, key: string, window: Window) {
  const now = ctx.now().getTime();
  // Now and then, drop expired counters so the table stays small.
  if (Math.random() < 0.01) {
    await ctx.db.delete(rateLimits).where(lt(rateLimits.resetAt, now));
  }
  return take(ctx, key, window.limit, now + window.windowMs);
}

const nextUtcMidnight = (now: Date) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);

/** A budget that resets at midnight UTC. */
export function consumeDaily(ctx: Ctx, key: string, limit: number) {
  return take(ctx, key, limit, nextUtcMidnight(ctx.now()));
}

/** Give back one unit, for attempts that didn't end up costing anything. */
export async function refund(ctx: Ctx, key: string) {
  await ctx.db
    .update(rateLimits)
    .set({ count: sql`MAX(${rateLimits.count} - 1, 0)` })
    .where(eq(rateLimits.key, key));
}

/** Claim "at most once per interval". True means this caller may send. */
export async function claimThrottle(ctx: Ctx, key: string, intervalMs: number) {
  const now = ctx.now().getTime();
  const rows = await ctx.db
    .insert(emailThrottles)
    .values({ key, lastSentAt: now })
    .onConflictDoUpdate({
      target: emailThrottles.key,
      set: { lastSentAt: now },
      where: sql`${emailThrottles.lastSentAt} <= ${now - intervalMs}`
    })
    .returning({ key: emailThrottles.key });
  return rows.length > 0;
}

export async function releaseThrottle(ctx: Ctx, key: string) {
  await ctx.db.delete(emailThrottles).where(eq(emailThrottles.key, key));
}

/** A one-way form of the client address, so limits don't store raw IPs. */
export const clientKey = async (ip: string) => (await sha256(`ip:${ip}`)).slice(0, 24);
