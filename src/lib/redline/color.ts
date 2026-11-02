const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: string) => HEX.test(value);

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * White or black, whichever reads better on the workspace's accent. One of the
 * two always clears 4.5:1, which a softer near-black doesn't on mid-grays.
 */
export function readableOn(hex: string): string {
  return contrast(hex, '#FFFFFF') >= contrast(hex, '#000000')
    ? '#FFFFFF'
    : '#000000';
}
