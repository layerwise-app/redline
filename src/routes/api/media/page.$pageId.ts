import { createFileRoute } from '@tanstack/react-router';
import { requirePage } from '~/domain/access';
import { serverCtx } from '~/server/context';
import { mediaResponse, streamFile } from '~/server/http';
import { sessionActor } from '~/server/session';

export const Route = createFileRoute('/api/media/page/$pageId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const actor = await sessionActor(request.headers);
          const page = await requirePage(ctx, actor, params.pageId);
          return streamFile(ctx, request, page.previewKey, {
            contentType: page.contentType
          });
        })
    }
  }
});
