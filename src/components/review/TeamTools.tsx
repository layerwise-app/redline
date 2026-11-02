import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { notifyClientsFn } from '~/server/team.functions';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import type { TeamToolsContext } from './ReviewScreen';
import { ShareDialog } from './ShareDialog';
import { DropZone, JobList, UploadDialog, useUploader } from './UploadDialog';

/** Upload, Notify clients, and Share, in the review toolbar. */
export function TeamTools({ context }: { context: TeamToolsContext }) {
  const { asset, snapshot, refresh, showAsset } = context;
  const [shareOpen, setShareOpen] = useState(false);
  const [upload, setUpload] = useState<null | 'new-version' | 'add'>(null);
  const current = asset?.versions.find((v) => v.id === asset.currentVersionId);

  const notify = useMutation({
    mutationFn: () => notifyClientsFn({ data: { versionId: current!.id } }),
    onSuccess: async ({ results }) => {
      const sent = results.filter((result) => result.sent);
      if (sent.length) {
        toast.success(
          `Notified ${sent.length} ${sent.length === 1 ? 'client' : 'clients'} about V${current!.number}.`
        );
      }
      for (const result of results) {
        if (!result.sent && result.message) {
          toast.error(`${result.email}: ${result.message}`);
        }
      }
      if (!sent.length) setShareOpen(true);
      await refresh();
    },
    onError: (cause) => {
      toast.error(cause instanceof Error ? cause.message : 'That didn’t send.');
      if (cause instanceof Error && cause.message.includes('Share')) setShareOpen(true);
    }
  });

  // Only offered once there's a new version to tell people about, and never automatic.
  const canNotify = Boolean(current && current.number > 1 && !current.notifiedAt);

  return (
    <>
      {canNotify ? (
        <Button
          size='sm'
          variant='outline'
          data-testid='notify-clients'
          disabled={notify.isPending}
          onClick={() => notify.mutate()}
        >
          Notify clients
        </Button>
      ) : null}
      {asset ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='sm' variant='outline' data-testid='upload-menu'>
              Upload
              <ChevronDown aria-hidden className='size-3.5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem data-testid='upload-new-version' onSelect={() => setUpload('new-version')}>
              New version of {asset.name}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid='upload-add' onSelect={() => setUpload('add')}>
              Add another file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button size='sm' data-testid='share' onClick={() => setShareOpen(true)}>
        Share
      </Button>

      <ShareDialog
        open={shareOpen}
        reviewId={snapshot.reviewId}
        onClose={() => setShareOpen(false)}
      />
      <UploadDialog
        open={upload !== null}
        reviewId={snapshot.reviewId}
        asset={
          upload === 'new-version' && asset && current
            ? { id: asset.id, name: asset.name, nextVersion: current.number + 1 }
            : null
        }
        onClose={() => setUpload(null)}
        onUploaded={async (result) => {
          await refresh();
          showAsset(result.assetId);
        }}
      />
    </>
  );
}

/** A review with no files yet: the whole canvas is the drop target. */
export function EmptyReviewDrop({ context }: { context: TeamToolsContext }) {
  const uploader = useUploader({
    reviewId: context.snapshot.reviewId,
    assetId: null,
    copyOpenComments: false,
    onUploaded: async (result) => {
      await context.refresh();
      context.showAsset(result.assetId);
    }
  });
  return (
    <div className='flex h-full items-center justify-center overflow-y-auto bg-wash p-4 sm:p-8'>
      <div className='w-full max-w-xl space-y-4'>
        <DropZone
          title='Drop your mockups here'
          onFiles={uploader.start}
          testId='review-dropzone'
        />
        <JobList jobs={uploader.jobs} />
      </div>
    </div>
  );
}
