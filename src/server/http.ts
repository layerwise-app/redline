import { getRequest, getRequestHeader, getCookie, setCookie } from '@tanstack/react-start/server';
import type { Ctx } from '~/domain/context';
import { AppError } from '~/domain/errors';
import type { CookieJar } from '~/domain/guest';

/**
 * Auth and guest cookies are SameSite=None so the preview can embed the app, which
 * means the browser would attach them to another site's POST. Refuse those.
 */
export function assertSameOrigin(request: Request = getRequest()) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new AppError('Forbidden.', 'forbidden', 403);
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError('Forbidden.', 'forbidden', 403);
  }
  if (originHost !== host) throw new AppError('Forbidden.', 'forbidden', 403);
}

export const cookieJar = (): CookieJar => ({
  get: (name) => getCookie(name),
  set: (name, value, maxAge) =>
    setCookie(name, value, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      maxAge
    })
});

export const clientIp = () => getRequestHeader('cf-connecting-ip') ?? 'local';

const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  // Files never run as documents here, whatever their bytes say.
  'content-security-policy': "default-src 'none'; sandbox"
};

/**
 * Streams a private file after the caller has done its access check. `no-cache`
 * means the browser must revalidate, so the check runs on every view and a
 * revoked link stops working at once.
 */
export async function streamFile(
  ctx: Ctx,
  request: Request,
  key: string,
  options: { contentType?: string; downloadName?: string } = {}
): Promise<Response> {
  const object = await ctx.storage.get(key);
  if (!object) return new Response('Not found', { status: 404, headers: SAFE_HEADERS });
  const etag = `"${object.etag}"`;
  if (request.headers.get('if-none-match') === etag) {
    await object.body.cancel();
    return new Response(null, {
      status: 304,
      headers: { ...SAFE_HEADERS, etag, 'cache-control': 'private, no-cache' }
    });
  }
  const headers: Record<string, string> = {
    ...SAFE_HEADERS,
    etag,
    'cache-control': 'private, no-cache',
    'content-type': options.contentType ?? object.contentType,
    'content-length': String(object.size)
  };
  if (options.downloadName) {
    const fallback = options.downloadName.replace(/[^\w.-]+/g, '_');
    headers['content-disposition'] =
      `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`;
  }
  return new Response(object.body, { headers });
}

/** Turns a refused access check into a bare status, with nothing else revealed. */
export async function mediaResponse(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.status === 404 ? 'Not found' : 'Not available', {
        status: error.status,
        headers: { ...SAFE_HEADERS, 'cache-control': 'no-store' }
      });
    }
    throw error;
  }
}
