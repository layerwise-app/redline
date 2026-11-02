import { createFileRoute } from '@tanstack/react-router';
import { guestOriginalObject } from '~/domain/guest';
import { serverCtx } from '~/server/context';
import { cookieJar, mediaResponse, streamFile } from '~/server/http';

export const Route = createFileRoute('/api/guest/$token/original/$versionId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const file = await guestOriginalObject(ctx, params, cookieJar());
          return streamFile(ctx, request, file.key, {
            contentType: file.contentType,
            downloadName: file.name
          });
        })
    }
  }
});
