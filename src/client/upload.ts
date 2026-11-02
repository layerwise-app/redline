import {
  REJECTED_TYPE_MESSAGE,
  sniffFileType,
  SVG_MESSAGE
} from '~/domain/files';
import { redline } from '~/redline.config';
import {
  abortUploadFn,
  beginUploadFn,
  finalizeVersionFn,
  finishOriginalFn
} from '~/server/team.functions';

export type UploadProgress = {
  stage: 'checking' | 'uploading' | 'rendering' | 'finishing';
  /** 0 to 1 within the whole upload. */
  fraction: number;
  detail: string;
};

const QUALITY = 0.88;

async function encodePreview(canvas: HTMLCanvasElement): Promise<Blob> {
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp', QUALITY);
  if (webp && webp.type === 'image/webp') return webp;
  // Safari's canvas can't encode WebP.
  const jpeg = await toBlob('image/jpeg', 0.9);
  if (!jpeg) throw new Error('This browser couldn’t make a preview.');
  return jpeg;
}

function freeCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

async function imagePreview(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image can’t be opened. It may be damaged.');
  });
  const scale = Math.min(1, redline.limits.previewMaxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await encodePreview(canvas);
  freeCanvas(canvas);
  return blob;
}

/** pdf.js parses in a web worker; pages are drawn here one at a time. */
async function openPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({ data }).promise.catch(() => {
    throw new Error('This PDF can’t be opened. It may be damaged or password protected.');
  });
}

type PdfDocument = Awaited<ReturnType<typeof openPdf>>;

async function pdfPagePreview(pdf: PdfDocument, number: number): Promise<Blob> {
  const page = await pdf.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(redline.limits.previewMaxWidth / base.width, 3);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({
    canvas,
    canvasContext: canvas.getContext('2d')!,
    viewport
  }).promise;
  page.cleanup();
  const blob = await encodePreview(canvas);
  freeCanvas(canvas);
  return blob;
}

function putWithProgress(
  upload: { url: string; headers: Record<string, string> },
  file: File,
  onProgress: (fraction: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('The upload didn’t finish. Try again.'));
    request.onerror = () => reject(new Error('The upload lost its connection. Try again.'));
    request.send(file);
  });
}

async function postPreview(versionId: string, pageNumber: number, blob: Blob) {
  const response = await fetch(
    `/api/uploads/preview?versionId=${encodeURIComponent(versionId)}&page=${pageNumber}`,
    { method: 'POST', body: blob, headers: { 'content-type': blob.type } }
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'A page’s preview didn’t upload.');
  }
}

const CONTENT_TYPE = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf'
} as const;

/**
 * The full upload: check the file here for a fast answer, reserve space and send
 * the original straight to Storage, then render and send each page's preview.
 * The server repeats every check, since this code can't be trusted.
 */
export async function uploadFile(input: {
  file: File;
  reviewId: string;
  assetId: string | null;
  copyOpenComments: boolean;
  onProgress(progress: UploadProgress): void;
}): Promise<{ assetId: string; versionId: string; number: number }> {
  const { file, onProgress } = input;
  onProgress({ stage: 'checking', fraction: 0.01, detail: 'Checking the file' });

  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const type = sniffFileType(head);
  if (type === 'svg') throw new Error(SVG_MESSAGE);
  if (type === 'unknown') throw new Error(REJECTED_TYPE_MESSAGE);
  if (file.size > redline.limits.maxFileBytes) {
    throw new Error(
      `This file is over the ${Math.round(redline.limits.maxFileBytes / 1048576)} MB limit.`
    );
  }

  const pdf = type === 'pdf' ? await openPdf(file) : null;
  const pageCount = pdf?.numPages ?? 1;
  if (pageCount > redline.limits.maxPdfPages) {
    await pdf?.loadingTask.destroy();
    throw new Error(
      `This PDF has ${pageCount} pages. The limit is ${redline.limits.maxPdfPages}.`
    );
  }

  const begun = await beginUploadFn({
    data: {
      reviewId: input.reviewId,
      assetId: input.assetId,
      fileName: file.name,
      size: file.size,
      contentType: CONTENT_TYPE[type],
      pageCount,
      copyOpenComments: input.copyOpenComments
    }
  });

  try {
    await putWithProgress(begun.upload, file, (fraction) =>
      onProgress({
        stage: 'uploading',
        fraction: 0.02 + fraction * 0.48,
        detail: 'Uploading the original'
      })
    );
    onProgress({ stage: 'uploading', fraction: 0.5, detail: 'Checking the upload' });
    await finishOriginalFn({ data: { versionId: begun.versionId } });

    for (let number = 1; number <= pageCount; number++) {
      onProgress({
        stage: 'rendering',
        fraction: 0.5 + ((number - 1) / pageCount) * 0.47,
        detail:
          pageCount > 1
            ? `Rendering page ${number} of ${pageCount}`
            : 'Making a preview'
      });
      const blob = pdf
        ? await pdfPagePreview(pdf, number)
        : await imagePreview(file);
      await postPreview(begun.versionId, number, blob);
    }

    onProgress({ stage: 'finishing', fraction: 0.98, detail: 'Finishing up' });
    const done = await finalizeVersionFn({ data: { versionId: begun.versionId } });
    return { assetId: begun.assetId, versionId: done.versionId, number: done.number };
  } catch (error) {
    await abortUploadFn({ data: { versionId: begun.versionId } }).catch(() => undefined);
    throw error;
  } finally {
    await pdf?.loadingTask.destroy();
  }
}

export const ACCEPTED_FILES = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';
