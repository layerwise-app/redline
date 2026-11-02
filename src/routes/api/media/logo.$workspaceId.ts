import { createFileRoute } from '@tanstack/react-router';
import { getLogoObject } from '~/domain/workspaces';
import { serverCtx } from '~/server/context';
import { mediaResponse, streamFile } from '~/server/http';
import { sessionActor } from '~/server/session';

export const Route = createFileRoute('/api/media/logo/$workspaceId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const actor = await sessionActor(request.headers);
          const key = await getLogoObject(ctx, actor, params.workspaceId);
          return streamFile(ctx, request, key);
        })
    }
  }
});
