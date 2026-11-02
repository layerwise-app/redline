import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { user } from '~/db/schema';
import { createWorkspaceFor } from '~/domain/access';
import type { Actor, Ctx, StoragePort } from '~/domain/context';
import type { CookieJar } from '~/domain/guest';
import {
  addPreview,
  beginUpload,
  finalizeVersion,
  finishOriginal
} from '~/domain/uploads';
import type { EmailErrorCode, SendEmailInput } from '~/lib/email';

/** D1's API over node:sqlite, so the real Drizzle D1 driver runs in tests. */
function fakeD1(sqlite: DatabaseSync) {
  class Statement {
    constructor(
      private sql: string,
      private params: unknown[] = []
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params);
    }
    private rows(asArrays = false) {
      const statement = sqlite.prepare(this.sql);
      statement.setReturnArrays(asArrays);
      return statement.all(...(this.params as never[])) as unknown[];
    }
    async all() {
      return { results: this.rows(), success: true, meta: {} };
    }
    async run() {
      return { results: this.rows(), success: true, meta: {} };
    }
    async raw() {
      return this.rows(true);
    }
    async first() {
      return this.rows()[0] ?? null;
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql);
    }
  };
}

function applyMigrations(sqlite: DatabaseSync) {
  const root = join(import.meta.dirname, '../../drizzle');
  for (const name of readdirSync(root).sort()) {
    const sql = readFileSync(join(root, name, 'migration.sql'), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
}

export class FakeStorage implements StoragePort {
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  pending = new Map<string, { key: string; contentType: string; bytes?: Uint8Array }>();
  deleted: string[] = [];
  usageValue = {
    usedBytes: 0,
    reservedBytes: 0,
    limitBytes: null as number | null,
    maxFileBytes: 5 * 1024 * 1024 * 1024,
    objectCount: 0,
    readOnly: false,
    trashBytes: 0,
    trashObjectCount: 0
  };
  failWith: string | null = null;

  async usage() {
    return this.usageValue;
  }
  private meta(key: string, size: number, contentType: string) {
    return {
      key,
      size,
      etag: 'etag',
      contentType,
      visibility: 'private' as const,
      uploaded: new Date(),
      customMetadata: {}
    };
  }
  async createUpload(input: { key: string; contentType: string }) {
    if (this.failWith) throw new Error(`${this.failWith}Error: refused`);
    const id = crypto.randomUUID();
    this.pending.set(id, { key: input.key, contentType: input.contentType });
    return {
      id,
      url: `https://storage.test/${id}`,
      headers: { 'x-test': '1' },
      expiresAt: new Date(Date.now() + 3600_000)
    };
  }
  /** What the browser's PUT to the signed URL does. */
  browserPut(url: string, bytes: Uint8Array) {
    const id = url.split('/').pop()!;
    this.pending.get(id)!.bytes = bytes;
  }
  async completeUpload(id: string) {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('UploadNotFoundError: no upload');
    if (!pending.bytes) throw new Error('UploadIncompleteError: not finished');
    this.files.set(pending.key, {
      bytes: pending.bytes,
      contentType: pending.contentType
    });
    this.pending.delete(id);
    return this.meta(pending.key, pending.bytes.byteLength, pending.contentType);
  }
  async put(key: string, body: unknown, options?: { contentType?: string }) {
    if (this.failWith) throw new Error(`${this.failWith}Error: refused`);
    const bytes = body as Uint8Array;
    this.files.set(key, {
      bytes,
      contentType: options?.contentType ?? 'application/octet-stream'
    });
    return this.meta(key, bytes.byteLength, options?.contentType ?? '');
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length?: number } | { suffix: number } }
  ) {
    const file = this.files.get(key);
    if (!file) return null;
    let bytes = file.bytes;
    const range = options?.range;
    if (range && 'suffix' in range) bytes = bytes.slice(-range.suffix);
    else if (range) {
      bytes = bytes.slice(range.offset, range.offset + (range.length ?? bytes.length));
    }
    return {
      ...this.meta(key, bytes.byteLength, file.contentType),
      body: new Blob([bytes as BlobPart]).stream()
    };
  }
  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) {
      this.files.delete(key);
      this.deleted.push(key);
    }
  }
}

export class FakeEmail {
  sent: SendEmailInput[] = [];
  /** Answer the next sends with these errors. */
  errors: EmailErrorCode[] = [];
  throwNext = false;
  async send(input: SendEmailInput) {
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error('binding exploded');
    }
    const code = this.errors.shift();
    if (code) return { data: null, error: { code, message: code } };
    this.sent.push(input);
    return { data: { id: crypto.randomUUID() }, error: null };
  }
  to(address: string) {
    return this.sent.filter((mail) => mail.to === address);
  }
}

export function memoryCookies(): CookieJar & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (name) => values.get(name),
    set: (name, value) => {
      values.set(name, value);
    }
  };
}

export function makeHarness() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);
  const db = drizzle(fakeD1(sqlite) as never);
  const storage = new FakeStorage();
  const email = new FakeEmail();
  const clock = { now: new Date('2026-06-01T10:00:00.000Z') };
  const ctx: Ctx = {
    db,
    storage,
    email: email as unknown as Ctx['email'],
    now: () => new Date(clock.now),
    appUrl: 'https://redline.test',
    secret: async () => 'test-secret'
  };
  /** Move time forward, so ordering and windows behave like production. */
  const tick = (ms = 1000) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };

  async function signUp(name: string): Promise<{ actor: Actor; workspaceId: string }> {
    const id = crypto.randomUUID();
    const address = `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`;
    await db.insert(user).values({ id, name, email: address });
    const workspaceId = await createWorkspaceFor(ctx, { id, name });
    return { actor: { id, name, email: address }, workspaceId };
  }

  async function emailOf(id: string) {
    const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
    return row!.email;
  }

  /** The browser's whole upload flow against the domain layer. */
  async function upload(
    actor: Actor,
    input: {
      reviewId: string;
      assetId?: string | null;
      copyOpenComments?: boolean;
      pages?: number;
      fileName?: string;
    }
  ) {
    const pages = input.pages ?? 1;
    const isPdf = pages > 1;
    const original = isPdf ? pdfBytes() : pngBytes();
    const begun = await beginUpload(ctx, actor, {
      reviewId: input.reviewId,
      assetId: input.assetId ?? null,
      fileName: input.fileName ?? (isPdf ? 'brand.pdf' : 'home.png'),
      size: original.byteLength,
      contentType: isPdf ? 'application/pdf' : 'image/png',
      pageCount: pages,
      copyOpenComments: input.copyOpenComments ?? false
    });
    storage.browserPut(begun.upload.url, original);
    await finishOriginal(ctx, actor, { versionId: begun.versionId });
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      await addPreview(ctx, actor, {
        versionId: begun.versionId,
        pageNumber,
        bytes: webpBytes(1200, 800)
      });
    }
    const done = await finalizeVersion(ctx, actor, { versionId: begun.versionId });
    tick();
    return { ...done, assetId: begun.assetId };
  }

  return { ctx, db, sqlite, storage, email, clock, tick, signUp, emailOf, upload };
}

export type Harness = ReturnType<typeof makeHarness>;

export function pngBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  bytes.set([0, 0, 4, 0, 0, 0, 3, 0], 16);
  return bytes;
}

export function pdfBytes(count = 2): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj << /Type /Pages /Count ${count} >> endobj\n%%EOF`
  );
}

/** A real VP8X header: enough for the size parser and the type sniffer. */
export function webpBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  bytes.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  return bytes;
}

export const svgBytes = () =>
  new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
