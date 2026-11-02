import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { ProjectEmailRpc } from '~/lib/email';
import type { ProjectStorageRpc } from '~/lib/storage';

export type Db = DrizzleD1Database<Record<string, never>>;

export type StoragePort = Pick<
  ProjectStorageRpc,
  'get' | 'put' | 'delete' | 'createUpload' | 'completeUpload' | 'usage'
>;

/**
 * Everything the domain layer touches. Routes build one from the Worker's
 * bindings; tests build one over the real migrations with in-memory ports.
 */
export type Ctx = {
  db: Db;
  storage: StoragePort;
  email: ProjectEmailRpc;
  now: () => Date;
  /** Origin for links in email, like https://redline.layerwise.site. */
  appUrl: string;
  /** Key for signing guest cookies. */
  secret: () => Promise<string>;
};

/** A signed-in person. Only ever built from the verified session. */
export type Actor = { id: string; name: string; email: string };
