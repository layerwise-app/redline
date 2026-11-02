import { createFileRoute } from '@tanstack/react-router';
import { requireVersion } from '~/domain/access';
import { notFound } from '~/domain/errors';
import { serverCtx } from '~/server/context';
import { mediaResponse, streamFile } from '~/server/http';
import { sessionActor } from '~/server/session';

export const Route = createFileRoute('/api/media/original/$versionId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const actor = await sessionActor(request.headers);
          const version = await requireVersion(ctx, actor, params.versionId);
          if (version.status !== 'ready') throw notFound();
          return streamFile(ctx, request, version.originalKey, {
            contentType: version.contentType,
            downloadName: version.originalName
          });
        })
    }
  }
});
