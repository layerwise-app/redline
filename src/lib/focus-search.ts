/** `?c=<comment>` and `?a=<asset>` deep links, from the Inbox and from email. */
export function focusSearch(search: Record<string, unknown>): {
  c?: string;
  a?: string;
} {
  return {
    ...(typeof search.c === 'string' ? { c: search.c } : {}),
    ...(typeof search.a === 'string' ? { a: search.a } : {})
  };
}
