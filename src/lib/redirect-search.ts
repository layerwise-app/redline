/** Where to go after signing in. Same-site paths only, so links can't send people off. */
export function redirectSearch(search: Record<string, unknown>): { redirect?: string } {
  const value = search.redirect;
  return typeof value === 'string' && /^\/(?![/\\])/.test(value)
    ? { redirect: value }
    : {};
}
