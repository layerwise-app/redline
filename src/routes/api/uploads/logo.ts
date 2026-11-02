import { createFileRoute } from '@tanstack/react-router';
import { AppError } from '~/domain/errors';
import { setLogo } from '~/domain/workspaces';
import { redline } from '~/redline.config';
import { serverCtx } from '~/server/context';
import { assertSameOrigin } from '~/server/http';
import { sessionActor } from '~/server/session';

export const Route = createFileRoute('/api/uploads/logo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameOrigin(request);
          const actor = await sessionActor(request.headers);
          const url = new URL(request.url);
          const declared = Number(request.headers.get('content-length') ?? 0);
          if (declared > redline.limits.logoMaxBytes) {
            throw new AppError('Logos can be up to 2 MB.', 'FileTooLarge', 413);
          }
          await setLogo(serverCtx(), actor, {
            workspaceId: url.searchParams.get('workspaceId') ?? '',
            bytes: new Uint8Array(await request.arrayBuffer())
          });
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof AppError) {
            return Response.json(
              { error: error.message, code: error.code },
              { status: error.status }
            );
          }
          throw error;
        }
      }
    }
  }
});
