import { redline } from '~/redline.config';

/**
 * Pins are stored page-relative (0 to 1 on each axis). The view is one translate
 * and one scale, and these are the only conversions, so a pin lands on the same
 * spot of the design at every zoom and screen size.
 */
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type View = { zoom: number; tx: number; ty: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const clampZoom = (zoom: number) =>
  clamp(zoom, redline.canvas.minZoom, redline.canvas.maxZoom);

/** Screen position (relative to the viewport) of a page-relative point. */
export function pageToScreen(point: Point, page: Size, view: View): Point {
  return {
    x: view.tx + point.x * page.width * view.zoom,
    y: view.ty + point.y * page.height * view.zoom
  };
}

/** Page-relative point under a screen position, or null off the page. */
export function screenToPage(
  screen: Point,
  page: Size,
  view: View
): Point | null {
  const x = (screen.x - view.tx) / (page.width * view.zoom);
  const y = (screen.y - view.ty) / (page.height * view.zoom);
  // Allow for float rounding, so a point exactly on the edge stays on the page.
  const edge = 1e-9;
  if (x < -edge || x > 1 + edge || y < -edge || y > 1 + edge) return null;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

export function fitView(page: Size, viewport: Size, padding = 24): View {
  const zoom = clampZoom(
    Math.min(
      (viewport.width - padding * 2) / page.width,
      (viewport.height - padding * 2) / page.height,
      1
    )
  );
  return centered(page, viewport, zoom);
}

/** Tall pages fit to width and start at the top, the way a page is read. */
export function fitWidthView(page: Size, viewport: Size, padding = 24): View {
  const zoom = clampZoom(Math.min((viewport.width - padding * 2) / page.width, 1));
  const view = centered(page, viewport, zoom);
  return page.height * zoom > viewport.height - padding * 2
    ? { ...view, ty: padding }
    : view;
}

export function centered(page: Size, viewport: Size, zoom: number): View {
  return {
    zoom,
    tx: (viewport.width - page.width * zoom) / 2,
    ty: (viewport.height - page.height * zoom) / 2
  };
}

/** Change zoom while keeping the page point under `anchor` where it is. */
export function zoomAt(view: View, anchor: Point, nextZoom: number): View {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    tx: anchor.x - (anchor.x - view.tx) * ratio,
    ty: anchor.y - (anchor.y - view.ty) * ratio
  };
}

/** Keep at least `margin` px of the page reachable when panning. */
export function clampPan(
  view: View,
  page: Size,
  viewport: Size,
  margin = 80
): View {
  const width = page.width * view.zoom;
  const height = page.height * view.zoom;
  return {
    zoom: view.zoom,
    tx: clamp(view.tx, margin - width, viewport.width - margin),
    ty: clamp(view.ty, margin - height, viewport.height - margin)
  };
}

/** Pan the least needed to bring a point into view, or leave the view alone. */
export function revealPoint(
  view: View,
  point: Point,
  page: Size,
  viewport: Size,
  margin = 72
): View {
  const screen = pageToScreen(point, page, view);
  const inside =
    screen.x >= margin &&
    screen.x <= viewport.width - margin &&
    screen.y >= margin &&
    screen.y <= viewport.height - margin;
  if (inside) return view;
  return {
    zoom: view.zoom,
    tx: view.tx + (viewport.width / 2 - screen.x),
    ty: view.ty + (viewport.height / 3 - screen.y)
  };
}
