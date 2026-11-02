/** An error whose message is safe and useful to show to the person. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = 'error',
    readonly status: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Missing and forbidden look the same on purpose, so ids from other workspaces
 * can't be probed.
 */
export const notFound = () => new AppError('Not found.', 'not_found', 404);

export const rateLimited = (message: string) =>
  new AppError(message, 'rate_limited', 429);
