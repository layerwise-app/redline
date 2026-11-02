import { createFileRoute } from '@tanstack/react-router';
import { guestLogoKey } from '~/domain/guest';
import { serverCtx } from '~/server/context';
import { cookieJar, mediaResponse, streamFile } from '~/server/http';

export const Route = createFileRoute('/api/guest/$token/logo')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        mediaResponse(async () => {
          const ctx = serverCtx();
          const key = await guestLogoKey(ctx, params.token, cookieJar());
          return streamFile(ctx, request, key);
        })
    }
  }
});
