import { createFileRoute } from '@tanstack/react-router';
import { addPreview } from '~/domain/uploads';
import { AppError } from '~/domain/errors';
import { redline } from '~/redline.config';
import { serverCtx } from '~/server/context';
import { assertSameOrigin } from '~/server/http';
import { sessionActor } from '~/server/session';

const failure = (error: unknown) => {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  throw error;
};

// One rendered page per request, body is the image. Previews are small enough to
// go through the app, which lets the server read their real type and size first.
export const Route = createFileRoute('/api/uploads/preview')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameOrigin(request);
          const actor = await sessionActor(request.headers);
          const url = new URL(request.url);
          const declared = Number(request.headers.get('content-length') ?? 0);
          if (declared > redline.limits.previewMaxBytes) {
            throw new AppError('This page’s preview is too large.', 'FileTooLarge', 413);
          }
          await addPreview(serverCtx(), actor, {
            versionId: url.searchParams.get('versionId') ?? '',
            pageNumber: Number(url.searchParams.get('page') ?? 0),
            bytes: new Uint8Array(await request.arrayBuffer())
          });
          return Response.json({ ok: true });
        } catch (error) {
          return failure(error);
        }
      }
    }
  }
});
