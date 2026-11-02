import { redline } from '~/redline.config';

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'pdf' | 'svg' | 'unknown';

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** What a file really is, judged from its bytes and never from its name. */
export function sniffFileType(bytes: Uint8Array): SniffedType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 2048))
    .replace(/^﻿/, '')
    .trimStart()
    .toLowerCase();
  if (
    head.startsWith('<svg') ||
    ((head.startsWith('<?xml') || head.startsWith('<!doctype svg')) &&
      head.includes('<svg'))
  ) {
    return 'svg';
  }
  return 'unknown';
}

const CONTENT_TYPES = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
} as const;

export type AcceptedContentType = keyof typeof CONTENT_TYPES;

export function isAcceptedContentType(
  value: string
): value is AcceptedContentType {
  return value in CONTENT_TYPES;
}

/** Does the declared type match the real bytes? */
export function contentMatches(
  contentType: AcceptedContentType,
  sniffed: SniffedType
): boolean {
  return CONTENT_TYPES[contentType] === sniffed;
}

export const REJECTED_TYPE_MESSAGE =
  'Redline accepts JPG, PNG, WebP, and PDF files.';
export const SVG_MESSAGE =
  'SVG files aren’t accepted. Export a PNG or PDF and upload that.';

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u24le = (b: Uint8Array, o: number) =>
  b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

/** Pixel size from image headers, so previews can't lie about their size. */
export function parseImageSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  const type = sniffFileType(bytes);
  if (type === 'png' && bytes.length >= 24) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (type === 'webp' && bytes.length >= 30) {
    const chunk = ascii(bytes, 12, 16);
    if (chunk === 'VP8X') {
      return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    }
    if (chunk === 'VP8L') {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
      };
    }
    if (chunk === 'VP8 ') {
      return {
        width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
        height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff
      };
    }
    return null;
  }
  if (type === 'jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
      }
      offset += 2 + u16be(bytes, offset + 2);
    }
  }
  return null;
}

/**
 * The largest page count a PDF declares in its readable parts. Compressed object
 * streams can hide it, so this only ever rejects. The real ceiling is that no
 * version can register more pages than the limit.
 */
export function declaredPdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes);
  let max = 0;
  for (const match of text.matchAll(/\/Count\s+(\d{1,7})/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}

export type UploadCheck = {
  size: number;
  usedBytes: number;
  usage: { maxFileBytes: number; readOnly: boolean };
};

export type UploadRefusal = {
  code: 'FileTooLarge' | 'WorkspaceFull' | 'StorageReadOnly';
  message: string;
};

export const STORAGE_READ_ONLY_MESSAGE =
  'File storage is read-only because the project is over its quota. Existing reviews keep working, but uploads are paused until files are deleted or the plan changes.';

/** The per-file ceiling: the app's limit, capped by what Storage allows. */
export function maxFileBytes(usage: { maxFileBytes: number }): number {
  return Math.min(redline.limits.maxFileBytes, usage.maxFileBytes);
}

/** Every upload limit in one place. Returns why an upload can't go ahead. */
export function checkUpload({
  size,
  usedBytes,
  usage
}: UploadCheck): UploadRefusal | null {
  if (usage.readOnly) {
    return { code: 'StorageReadOnly', message: STORAGE_READ_ONLY_MESSAGE };
  }
  const perFile = maxFileBytes(usage);
  if (size > perFile) {
    return {
      code: 'FileTooLarge',
      message: `This file is ${formatBytes(size)}. The limit is ${formatBytes(perFile)} per file.`
    };
  }
  const limit = redline.limits.workspaceStorageBytes;
  if (usedBytes + size > limit) {
    return {
      code: 'WorkspaceFull',
      message: `This workspace has used ${formatBytes(usedBytes)} of ${formatBytes(limit)}, and this file needs ${formatBytes(size)}. Delete a review to free up space.`
    };
  }
  return null;
}
