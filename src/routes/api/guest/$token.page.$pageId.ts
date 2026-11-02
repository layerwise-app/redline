import { createFileRoute } from '@tanstack/react-router';
import { guestPageObject } from '~/domain/guest';
import { serverCtx } from '~/server/context';
import { cookieJar, mediaResponse, streamFile } from '~/server/http';

export const Route = createFileRoute('/api/guest/$token/page/$pageId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const page = await guestPageObject(ctx, params, cookieJar());
          return streamFile(ctx, request, page.key, {
            contentType: page.contentType
          });
        })
    }
  }
});
