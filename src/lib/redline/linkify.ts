export type TextPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * Plain text in, parts out, so React escapes everything and only http(s) links
 * can ever become anchors. Render links with rel="nofollow noopener".
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    let raw = match[0];
    // Keep a closing bracket that belongs to the URL itself.
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;
    const href = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    let valid = false;
    try {
      const url = new URL(href);
      valid = url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      valid = false;
    }
    if (!valid) continue;
    if (start > cursor) {
      parts.push({ type: 'text', text: text.slice(cursor, start) });
    }
    parts.push({ type: 'link', text: raw, href });
    cursor = start + raw.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
  return parts;
}

export const LINK_REL = 'nofollow noopener';
