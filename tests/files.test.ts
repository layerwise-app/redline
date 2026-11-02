import { describe, expect, it } from 'vitest';
import { beginUpload, finishOriginal, addPreview } from '~/domain/uploads';
import { createReview, listReviews, teamSnapshot } from '~/domain/reviews';
import { checkUpload, contentMatches, declaredPdfPageCount, formatBytes, parseImageSize, sniffFileType } from '~/domain/files';
import { linkify } from '~/lib/redline/linkify';
import { contrast, readableOn } from '~/lib/redline/color';
import { redline } from '~/redline.config';
import { versions } from '~/db/schema';
import { makeHarness, pdfBytes, pngBytes, svgBytes, webpBytes } from './helpers/harness';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const usage = { maxFileBytes: 5 * GB, readOnly: false };

describe('file checks', () => {
  it('identifies types from bytes', () => {
    expect(sniffFileType(pngBytes())).toBe('png');
    expect(sniffFileType(pdfBytes())).toBe('pdf');
    expect(sniffFileType(webpBytes(10, 10))).toBe('webp');
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFileType(svgBytes())).toBe('svg');
    expect(sniffFileType(new TextEncoder().encode('<?xml version="1.0"?>\n<svg></svg>'))).toBe('svg');
    expect(sniffFileType(new TextEncoder().encode('MZ executable'))).toBe('unknown');
  });

  it('matches declared types to real bytes', () => {
    expect(contentMatches('image/png', 'png')).toBe(true);
    expect(contentMatches('image/png', 'svg')).toBe(false);
    expect(contentMatches('application/pdf', 'png')).toBe(false);
  });

  it('reads pixel sizes from headers', () => {
    expect(parseImageSize(webpBytes(2880, 1800))).toEqual({ width: 2880, height: 1800 });
    expect(parseImageSize(pngBytes())).toEqual({ width: 1024, height: 768 });
  });

  it('reads the declared PDF page count', () => {
    expect(declaredPdfPageCount(pdfBytes(51))).toBe(51);
  });

  it('formats bytes', () => {
    expect(formatBytes(2 * GB)).toBe('2 GB');
    expect(formatBytes(1.5 * MB)).toBe('1.5 MB');
  });
});

describe('upload limits', () => {
  it('allows files within limits', () => {
    expect(checkUpload({ size: 10 * MB, usedBytes: 0, usage })).toBeNull();
    expect(checkUpload({ size: 100 * MB, usedBytes: 2 * GB - 100 * MB, usage })).toBeNull();
  });
  it('enforces 100 MB per file', () => {
    expect(checkUpload({ size: 100 * MB + 1, usedBytes: 0, usage })).toMatchObject({ code: 'FileTooLarge' });
  });
  it('caps by what Storage allows', () => {
    const refusal = checkUpload({ size: 20 * MB, usedBytes: 0, usage: { maxFileBytes: 10 * MB, readOnly: false } });
    expect(refusal).toMatchObject({ code: 'FileTooLarge' });
    expect(refusal!.message).toContain('10 MB');
  });
  it('enforces 2 GB per workspace with a clear message', () => {
    const refusal = checkUpload({ size: 30 * MB, usedBytes: 2 * GB - 10 * MB, usage });
    expect(refusal).toMatchObject({ code: 'WorkspaceFull' });
    expect(refusal!.message).toContain('of 2 GB');
  });
  it('reports read-only Storage', () => {
    expect(checkUpload({ size: 1, usedBytes: 0, usage: { ...usage, readOnly: true } })).toMatchObject({ code: 'StorageReadOnly' });
  });
});

describe('uploading through the domain', () => {
  async function ready() {
    const h = makeHarness();
    const { actor, workspaceId } = await h.signUp('Tess Team');
    const { id: reviewId } = await createReview(h.ctx, actor, { name: 'R', clientName: 'C' });
    return { h, actor, workspaceId, reviewId };
  }
  const input = (reviewId: string) => ({
    reviewId,
    assetId: null,
    fileName: 'home.png',
    size: pngBytes().byteLength,
    contentType: 'image/png',
    pageCount: 1,
    copyOpenComments: false
  });

  it('rejects SVG by type and by name', async () => {
    const { h, actor, reviewId } = await ready();
    await expect(beginUpload(h.ctx, actor, { ...input(reviewId), contentType: 'image/svg+xml', fileName: 'a.svg' })).rejects.toThrow(/SVG/);
    await expect(beginUpload(h.ctx, actor, { ...input(reviewId), fileName: 'a.svg' })).rejects.toThrow(/SVG/);
  });

  it('checks the real bytes: an SVG uploaded as a PNG is deleted', async () => {
    const { h, actor, reviewId } = await ready();
    const begun = await beginUpload(h.ctx, actor, { ...input(reviewId), size: svgBytes().byteLength });
    h.storage.browserPut(begun.upload.url, svgBytes());
    await expect(finishOriginal(h.ctx, actor, { versionId: begun.versionId })).rejects.toThrow(/SVG/);
    expect(h.storage.files.size).toBe(0);
    expect((await h.db.select().from(versions)).length).toBe(0);
  });

  it('checks the real bytes: a declared size mismatch is deleted', async () => {
    const { h, actor, reviewId } = await ready();
    const begun = await beginUpload(h.ctx, actor, { ...input(reviewId), size: 5 });
    h.storage.browserPut(begun.upload.url, pngBytes());
    await expect(finishOriginal(h.ctx, actor, { versionId: begun.versionId })).rejects.toThrow(/size/);
    expect(h.storage.files.size).toBe(0);
  });

  it('enforces the PDF page limit on the server', async () => {
    const { h, actor, reviewId } = await ready();
    await expect(beginUpload(h.ctx, actor, { ...input(reviewId), contentType: 'application/pdf', fileName: 'a.pdf', pageCount: 51 })).rejects.toThrow(/limit is 50/);
    const bytes = pdfBytes(51);
    const begun = await beginUpload(h.ctx, actor, { ...input(reviewId), contentType: 'application/pdf', fileName: 'a.pdf', pageCount: 2, size: bytes.byteLength });
    h.storage.browserPut(begun.upload.url, bytes);
    await expect(finishOriginal(h.ctx, actor, { versionId: begun.versionId })).rejects.toThrow(/limit is 50/);
  });

  it('won’t take a preview past the page count or over the width limit', async () => {
    const { h, actor, reviewId } = await ready();
    const begun = await beginUpload(h.ctx, actor, input(reviewId));
    h.storage.browserPut(begun.upload.url, pngBytes());
    await finishOriginal(h.ctx, actor, { versionId: begun.versionId });
    await expect(addPreview(h.ctx, actor, { versionId: begun.versionId, pageNumber: 2, bytes: webpBytes(100, 100) })).rejects.toThrow(/page/);
    await expect(addPreview(h.ctx, actor, { versionId: begun.versionId, pageNumber: 1, bytes: webpBytes(redline.limits.previewMaxWidth + 1, 100) })).rejects.toThrow(/wide/);
    await expect(addPreview(h.ctx, actor, { versionId: begun.versionId, pageNumber: 1, bytes: svgBytes() })).rejects.toThrow(/WebP/);
  });

  it('blocks an upload when the workspace is at its limit', async () => {
    const { h, actor, workspaceId, reviewId } = await ready();
    await h.upload(actor, { reviewId });
    await h.db.update(versions).set({ originalSize: 2 * GB });
    void workspaceId;
    await expect(beginUpload(h.ctx, actor, input(reviewId))).rejects.toThrow(/of 2 GB/);
  });

  it('handles Storage refusing with a clear message', async () => {
    const { h, actor, reviewId } = await ready();
    h.storage.failWith = 'StorageQuotaExceeded';
    await expect(beginUpload(h.ctx, actor, input(reviewId))).rejects.toThrow(/read-only/);
    expect((await listReviews(h.ctx, actor))[0]!.assetCount).toBe(0);
    h.storage.failWith = 'FileTooLarge';
    await expect(beginUpload(h.ctx, actor, input(reviewId))).rejects.toThrow(/over the limit/);
    h.storage.failWith = null;
    h.storage.usageValue.readOnly = true;
    await expect(beginUpload(h.ctx, actor, input(reviewId))).rejects.toThrow(/read-only/);
  });

  it('hides a version until every page is in', async () => {
    const { h, actor, reviewId } = await ready();
    const begun = await beginUpload(h.ctx, actor, { ...input(reviewId), contentType: 'application/pdf', fileName: 'a.pdf', pageCount: 2, size: pdfBytes().byteLength });
    h.storage.browserPut(begun.upload.url, pdfBytes());
    await finishOriginal(h.ctx, actor, { versionId: begun.versionId });
    await addPreview(h.ctx, actor, { versionId: begun.versionId, pageNumber: 1, bytes: webpBytes(100, 100) });
    expect((await teamSnapshot(h.ctx, actor, reviewId)).assets).toEqual([]);
  });
});

describe('comment links', () => {
  it('finds http, https, and www links, leaving trailing punctuation out', () => {
    expect(linkify('See https://example.com/a?b=1, and www.foo.test.')).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', text: ', and ' },
      { type: 'link', text: 'www.foo.test', href: 'https://www.foo.test' },
      { type: 'text', text: '.' }
    ]);
  });
  it('never links other schemes', () => {
    for (const text of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.test']) {
      expect(linkify(text).every((part) => part.type === 'text')).toBe(true);
    }
  });
  it('leaves HTML as plain text', () => {
    expect(linkify('<script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<script>alert(1)</script>' }
    ]);
  });
});

describe('design tokens', () => {
  const { colors } = redline;
  it('keeps text at 4.5:1 or better', () => {
    for (const background of [colors.paper, colors.wash]) {
      expect(contrast(colors.ink, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.inkMuted, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(colors.internal, colors.internalWash)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps pin numbers readable on any workspace accent', () => {
    for (const accent of [colors.accent, '#FFEB3B', '#0B3D91', '#FFFFFF', '#000000', '#7F7F7F']) {
      expect(contrast(accent, readableOn(accent))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
