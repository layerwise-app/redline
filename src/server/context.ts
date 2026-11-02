import { env } from 'cloudflare:workers';
import { getRequestUrl } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { appSecrets } from '~/db/schema';
import type { Ctx } from '~/domain/context';
import { randomToken } from '~/domain/crypto';
import { site } from '~/lib/site';

let cachedSecret: string | null = null;

/**
 * Key for signing guest cookies. Prefers the deployment's auth secret; without
 * one, a random key is generated once and kept in the database.
 */
async function signingSecret(): Promise<string> {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  await db
    .insert(appSecrets)
    .values({ name: 'cookie-signing', value: `${randomToken()}${randomToken()}` })
    .onConflictDoNothing();
  const [row] = await db
    .select({ value: appSecrets.value })
    .from(appSecrets)
    .where(eq(appSecrets.name, 'cookie-signing'));
  cachedSecret = row!.value;
  return cachedSecret;
}

export function serverCtx(): Ctx {
  return {
    db,
    storage: env.STORAGE,
    email: env.EMAIL,
    now: () => new Date(),
    get appUrl() {
      return site.url || getRequestUrl().origin;
    },
    secret: signingSecret
  };
}
