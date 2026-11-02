import { useEffect, useRef, useState } from 'react';
import { ACCEPTED_FILES, uploadFile, type UploadProgress } from '~/client/upload';
import { formatBytes } from '~/domain/files';
import { redline } from '~/redline.config';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';

const LIMITS_LINE = `JPG, PNG, WebP, or PDF. Up to ${formatBytes(redline.limits.maxFileBytes)} per file and ${redline.limits.maxPdfPages} PDF pages.`;

export function DropZone({
  onFiles,
  multiple = true,
  title = 'Drop files to start a review',
  compact = false,
  testId = 'dropzone'
}: {
  onFiles(files: File[]): void;
  multiple?: boolean;
  title?: string;
  compact?: boolean;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid={testId}
      data-over={over}
      className={`rl-dropzone flex flex-col items-center justify-center gap-2 rounded text-center ${compact ? 'px-4 py-8' : 'px-6 py-16'}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      <p className='text-base font-medium'>{title}</p>
      <p className='max-w-sm text-ink-muted'>{LIMITS_LINE}</p>
      <Button
        type='button'
        variant='outline'
        className='mt-2'
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
      <input
        ref={inputRef}
        data-testid={`${testId}-input`}
        type='file'
        accept={ACCEPTED_FILES}
        multiple={multiple}
        className='sr-only'
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

type Job = {
  name: string;
  progress: UploadProgress | null;
  error: string | null;
  done: boolean;
};

/**
 * Runs uploads one at a time, showing each file's progress. A file that fails
 * shows why and doesn't stop the others.
 */
export function useUploader({
  reviewId,
  assetId,
  copyOpenComments,
  onUploaded
}: {
  reviewId: string;
  assetId: string | null;
  copyOpenComments: boolean;
  onUploaded(result: { assetId: string; versionId: string; number: number }): void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);

  const start = async (files: File[]) => {
    setRunning(true);
    setJobs(files.map((file) => ({ name: file.name, progress: null, error: null, done: false })));
    const patch = (index: number, change: Partial<Job>) =>
      setJobs((current) =>
        current.map((job, i) => (i === index ? { ...job, ...change } : job))
      );
    for (const [index, file] of files.entries()) {
      try {
        const result = await uploadFile({
          file,
          reviewId,
          assetId,
          copyOpenComments,
          onProgress: (progress) => patch(index, { progress })
        });
        patch(index, { done: true });
        onUploaded(result);
      } catch (cause) {
        patch(index, {
          error: cause instanceof Error ? cause.message : 'The upload failed.'
        });
      }
    }
    setRunning(false);
  };

  return { jobs, running, start, reset: () => setJobs([]) };
}

export function JobList({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  return (
    <ul className='space-y-3' data-testid='upload-jobs'>
      {jobs.map((job, index) => (
        <li key={index} className='space-y-1'>
          <div className='flex justify-between gap-3'>
            <span className='truncate'>{job.name}</span>
            <span className='shrink-0 text-xs text-ink-muted'>
              {job.error ? 'Failed' : job.done ? 'Done' : job.progress?.detail ?? 'Waiting'}
            </span>
          </div>
          {job.error ? (
            <p role='alert' data-testid='upload-error' className='text-sm text-destructive'>
              {job.error}
            </p>
          ) : (
            <Progress
              value={job.done ? 100 : Math.round((job.progress?.fraction ?? 0) * 100)}
              aria-label={`Progress for ${job.name}`}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function UploadDialog({
  open,
  reviewId,
  asset,
  onClose,
  onUploaded
}: {
  open: boolean;
  reviewId: string;
  /** Set to upload a new version of this asset; null adds new files. */
  asset: { id: string; name: string; nextVersion: number } | null;
  onClose(): void;
  onUploaded(result: { assetId: string; versionId: string; number: number }): void;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const uploader = useUploader({
    reviewId,
    assetId: asset?.id ?? null,
    copyOpenComments: Boolean(asset) && copyOpen,
    onUploaded
  });
  const { jobs, running, reset } = uploader;

  useEffect(() => {
    if (open) reset();
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && jobs.length && !running && jobs.every((job) => job.done)) onClose();
  }, [open, jobs, running, onClose]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !running && onClose()}>
      <DialogContent className='sm:max-w-md' data-testid='upload-dialog'>
        <DialogHeader>
          <DialogTitle>
            {asset ? `Upload V${asset.nextVersion} of ${asset.name}` : 'Add files'}
          </DialogTitle>
          <DialogDescription>
            {asset
              ? 'The new version becomes current and resets this file to In review. Earlier decisions stay in the history.'
              : 'Each file becomes its own asset in this review.'}
          </DialogDescription>
        </DialogHeader>
        {jobs.length ? null : (
          <DropZone
            compact
            multiple={!asset}
            title={asset ? 'Drop the new version here' : 'Drop files here'}
            onFiles={uploader.start}
            testId='upload-dropzone'
          />
        )}
        {asset && !jobs.length ? (
          <div className='flex items-start gap-2'>
            <Checkbox
              id='copy-open'
              data-testid='copy-open'
              checked={copyOpen}
              onCheckedChange={(value) => setCopyOpen(value === true)}
            />
            <Label htmlFor='copy-open' className='leading-snug font-normal'>
              Copy open comments forward, labeled “From V{asset.nextVersion - 1}”
            </Label>
          </div>
        ) : null}
        <JobList jobs={jobs} />
        {jobs.some((job) => job.error) && !running ? (
          <Button type='button' variant='outline' onClick={reset}>
            Try another file
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
