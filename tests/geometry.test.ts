import { describe, expect, it } from 'vitest';
import {
  clampPan,
  fitView,
  fitWidthView,
  pageToScreen,
  revealPoint,
  screenToPage,
  zoomAt,
  type Size,
  type View
} from '~/lib/redline/geometry';

const pages: Size[] = [
  { width: 2880, height: 5038 },
  { width: 2560, height: 1600 },
  { width: 800, height: 1000 },
  { width: 37, height: 2000 }
];
const viewports: Size[] = [
  { width: 390, height: 700 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1300 }
];
const zooms = [0.05, 0.1, 0.25, 0.5, 1, 1.75, 4, 8];
const points = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 0.5, y: 0.5 },
  { x: 0.1234, y: 0.8765 },
  { x: 0.999, y: 0.001 }
];

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('pins stay on the same spot of the design', () => {
  it('round-trips at every zoom, pan, and screen size', () => {
    for (const page of pages) {
      for (const viewport of viewports) {
        for (const zoom of zooms) {
          const fit = fitView(page, viewport);
          const view: View = { zoom, tx: fit.tx - 37.5, ty: fit.ty + 11.25 };
          for (const point of points) {
            const screen = pageToScreen(point, page, view);
            const back = screenToPage(screen, page, view);
            expect(back).not.toBeNull();
            close(back!.x, point.x);
            close(back!.y, point.y);
          }
        }
      }
    }
  });

  it('marks the same pixel of the design on different screens', () => {
    const page = pages[0]!;
    const point = { x: 0.3141, y: 0.2718 };
    for (const viewport of viewports) {
      const view = fitView(page, viewport);
      const screen = pageToScreen(point, page, view);
      // What lies under the pin, measured back in the image's own pixels.
      const imagePixelX = (screen.x - view.tx) / view.zoom;
      const imagePixelY = (screen.y - view.ty) / view.zoom;
      close(imagePixelX, point.x * page.width);
      close(imagePixelY, point.y * page.height);
    }
  });

  it('keeps a pin over the same pixel while zooming around any anchor', () => {
    const page = pages[1]!;
    const viewport = viewports[2]!;
    const point = { x: 0.62, y: 0.41 };
    let view = fitView(page, viewport);
    for (const [zoom, anchor] of [
      [2, { x: 100, y: 200 }],
      [0.3, { x: 900, y: 50 }],
      [6, { x: 400, y: 400 }],
      [1, { x: 0, y: 0 }]
    ] as const) {
      view = zoomAt(view, anchor, zoom);
      const screen = pageToScreen(point, page, view);
      close((screen.x - view.tx) / view.zoom / page.width, point.x);
      close((screen.y - view.ty) / view.zoom / page.height, point.y);
    }
  });

  it('holds the point under the cursor still when zooming', () => {
    const page = pages[2]!;
    const view: View = { zoom: 0.5, tx: 40, ty: 90 };
    const anchor = { x: 321, y: 123 };
    const before = screenToPage(anchor, page, view)!;
    const after = screenToPage(anchor, page, zoomAt(view, anchor, 3))!;
    close(after.x, before.x);
    close(after.y, before.y);
  });

  it('treats clicks off the page as no pin', () => {
    const page = pages[2]!;
    const view: View = { zoom: 1, tx: 100, ty: 100 };
    expect(screenToPage({ x: 99, y: 150 }, page, view)).toBeNull();
    expect(screenToPage({ x: 150, y: 1101 }, page, view)).toBeNull();
    expect(screenToPage({ x: 100, y: 100 }, page, view)).toEqual({ x: 0, y: 0 });
  });
});

describe('fit, 100%, and pan', () => {
  it('fits the whole page inside the viewport', () => {
    for (const page of pages) {
      for (const viewport of viewports) {
        const view = fitView(page, viewport);
        const tl = pageToScreen({ x: 0, y: 0 }, page, view);
        const br = pageToScreen({ x: 1, y: 1 }, page, view);
        expect(tl.x).toBeGreaterThanOrEqual(0);
        expect(tl.y).toBeGreaterThanOrEqual(0);
        expect(br.x).toBeLessThanOrEqual(viewport.width);
        expect(br.y).toBeLessThanOrEqual(viewport.height);
      }
    }
  });

  it('never upscales past 100% to fit', () => {
    expect(fitView({ width: 100, height: 100 }, { width: 2000, height: 2000 }).zoom).toBe(1);
  });

  it('fit width starts a tall page at its top', () => {
    const page = pages[0]!;
    const viewport = viewports[2]!;
    const view = fitWidthView(page, viewport);
    close(page.width * view.zoom, viewport.width - 48);
    expect(view.ty).toBe(24);
  });

  it('keeps part of the page reachable however far it is panned', () => {
    const page = pages[2]!;
    const viewport = viewports[0]!;
    const view = clampPan({ zoom: 1, tx: -99999, ty: 99999 }, page, viewport);
    expect(view.tx + page.width).toBeGreaterThanOrEqual(80);
    expect(view.ty).toBeLessThanOrEqual(viewport.height - 80);
  });

  it('brings an off-screen pin into view only when needed', () => {
    const page = pages[0]!;
    const viewport = viewports[2]!;
    const view: View = { zoom: 1, tx: 0, ty: 0 };
    expect(revealPoint(view, { x: 0.1, y: 0.1 }, page, viewport)).toBe(view);
    const moved = revealPoint(view, { x: 0.9, y: 0.95 }, page, viewport);
    const screen = pageToScreen({ x: 0.9, y: 0.95 }, page, moved);
    expect(screen.x).toBeGreaterThan(0);
    expect(screen.x).toBeLessThan(viewport.width);
    expect(screen.y).toBeGreaterThan(0);
    expect(screen.y).toBeLessThan(viewport.height);
  });
});
