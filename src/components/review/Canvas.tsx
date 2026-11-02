import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  centered,
  clampPan,
  fitView,
  fitWidthView,
  pageToScreen,
  revealPoint,
  screenToPage,
  zoomAt,
  type Point,
  type Size,
  type View
} from '~/lib/redline/geometry';

export type CanvasPin = {
  id: string;
  x: number;
  y: number;
  label: string;
  internal: boolean;
  resolved: boolean;
  selected: boolean;
  title: string;
};

export type CanvasHandle = {
  fit(): void;
  actualSize(): void;
  zoomBy(factor: number): void;
  reveal(point: Point): void;
  focus(): void;
};

type Props = {
  page: { id: string; url: string; width: number; height: number };
  alt: string;
  pins: CanvasPin[];
  pending: { x: number; y: number; label: string; internal: boolean } | null;
  theme: 'light' | 'dark';
  placing: boolean;
  onPlacingChange(placing: boolean): void;
  onDrop(point: Point): void;
  onSelectPin(id: string): void;
  onViewChange?(view: View): void;
  /** Hide the pin-dropping keyboard hint, like on phones. */
  hint?: boolean;
};

const CLICK_SLOP = 5;
const TOUCH_SLOP = 10;

/** A tall page opens at reading width; anything else opens whole. */
const initialView = (page: Size, viewport: Size) =>
  page.height / page.width > 1.3 && viewport.width > 500
    ? fitWidthView(page, viewport)
    : fitView(page, viewport);

type Gesture =
  | { kind: 'press'; x: number; y: number; touch: boolean; moved: boolean; view: View }
  | { kind: 'pan'; x: number; y: number; view: View }
  | { kind: 'pinch'; distance: number; mid: Point; view: View };

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  {
    page,
    alt,
    pins,
    pending,
    theme,
    placing,
    onPlacingChange,
    onDrop,
    onSelectPin,
    onViewChange,
    hint = true
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size | null>(null);
  const [view, setViewState] = useState<View | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const touched = useRef(false);
  const viewRef = useRef<View | null>(null);
  const viewportRef = useRef<Size | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const setView = useCallback(
    (next: View) => {
      viewRef.current = next;
      setViewState(next);
      onViewChange?.(next);
    },
    [onViewChange]
  );

  // Changes made by the person, as opposed to the automatic fit.
  const moveView = useCallback(
    (next: View) => {
      touched.current = true;
      const size = viewportRef.current;
      setView(size ? clampPan(next, pageRef.current, size) : next);
    },
    [setView]
  );

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      if (next.width < 1 || next.height < 1) return;
      viewportRef.current = next;
      setViewport(next);
      if (!viewRef.current || !touched.current) {
        setView(initialView(pageRef.current, next));
      } else {
        setView(clampPan(viewRef.current, pageRef.current, next));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [setView]);

  // A different page starts fresh.
  const pageId = page.id;
  const lastPage = useRef(pageId);
  useEffect(() => {
    if (lastPage.current === pageId) return;
    lastPage.current = pageId;
    touched.current = false;
    if (viewportRef.current) {
      setView(initialView(pageRef.current, viewportRef.current));
    }
  }, [pageId, setView]);

  useImperativeHandle(
    ref,
    () => ({
      fit() {
        if (!viewportRef.current) return;
        touched.current = false;
        setView(fitView(pageRef.current, viewportRef.current));
      },
      actualSize() {
        if (!viewportRef.current) return;
        touched.current = true;
        setView(centered(pageRef.current, viewportRef.current, 1));
      },
      zoomBy(factor) {
        const current = viewRef.current;
        const size = viewportRef.current;
        if (!current || !size) return;
        moveView(
          zoomAt(
            current,
            { x: size.width / 2, y: size.height / 2 },
            current.zoom * factor
          )
        );
      },
      reveal(point) {
        const current = viewRef.current;
        const size = viewportRef.current;
        if (!current || !size) return;
        const next = revealPoint(current, point, pageRef.current, size);
        if (next !== current) moveView(next);
      },
      focus() {
        rootRef.current?.focus({ preventScroll: true });
      }
    }),
    [moveView, setView]
  );

  // Wheel and trackpad pinch. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewRef.current;
      if (!current) return;
      const rect = element.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      // A trackpad reports sideways motion alongside the scroll; a wheel never does.
      if (!event.ctrlKey && !event.metaKey && event.deltaX !== 0) {
        moveView({
          ...current,
          tx: current.tx - event.deltaX,
          ty: current.ty - event.deltaY
        });
        return;
      }
      const lines = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const speed = event.ctrlKey ? 0.01 : 0.0022;
      moveView(zoomAt(current, anchor, current.zoom * Math.exp(-lines * speed)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [moveView]);

  // Space to pan, unless the keyboard is busy in a field or on a button.
  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element?.closest?.(
          'input, textarea, select, button, a, [contenteditable="true"], [role="menu"], [role="dialog"]'
        )
      );
    };
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (placing) {
      const current = viewRef.current;
      const size = viewportRef.current;
      const center =
        current && size
          ? screenToPage({ x: size.width / 2, y: size.height / 2 }, pageRef.current, current)
          : null;
      setCursor(center ?? { x: 0.5, y: 0.5 });
      rootRef.current?.focus({ preventScroll: true });
    }
  }, [placing]);

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-pin]')) return;
    const current = viewRef.current;
    if (!current) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
      gesture.current = {
        kind: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: current
      };
      return;
    }
    if (event.button === 1 || spaceHeld) {
      event.preventDefault();
      gesture.current = { kind: 'pan', x: point.x, y: point.y, view: current };
      setGrabbing(true);
      return;
    }
    if (event.button !== 0) return;
    gesture.current = {
      kind: 'press',
      x: point.x,
      y: point.y,
      touch: event.pointerType !== 'mouse',
      moved: false,
      view: current
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    const active = gesture.current;
    if (!active) return;

    if (active.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(active.view, active.mid, active.view.zoom * (distance / active.distance));
      moveView({
        ...zoomed,
        tx: zoomed.tx + (mid.x - active.mid.x),
        ty: zoomed.ty + (mid.y - active.mid.y)
      });
      return;
    }
    if (active.kind === 'pan') {
      moveView({
        ...active.view,
        tx: active.view.tx + (point.x - active.x),
        ty: active.view.ty + (point.y - active.y)
      });
      return;
    }
    const slop = active.touch ? TOUCH_SLOP : CLICK_SLOP;
    const far = Math.hypot(point.x - active.x, point.y - active.y) > slop;
    if (far) active.moved = true;
    // On touch one finger pans, since there's no Space key or wheel.
    if (active.moved && active.touch) {
      moveView({
        ...active.view,
        tx: active.view.tx + (point.x - active.x),
        ty: active.view.ty + (point.y - active.y)
      });
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const had = pointers.current.delete(event.pointerId);
    if (!had) return;
    const active = gesture.current;
    if (active?.kind === 'pinch') {
      // Lifting one of two fingers shouldn't turn into a tap.
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setGrabbing(false);
    if (cancelled || active?.kind !== 'press' || active.moved) return;
    const current = viewRef.current;
    if (!current) return;
    const spot = screenToPage(localPoint(event), pageRef.current, current);
    if (spot) {
      onPlacingChange(false);
      onDrop(spot);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement) !== rootRef.current) return;
    const current = viewRef.current;
    if (!current) return;
    const arrow = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    }[event.key];

    if (placing) {
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? 0.05 : 0.01;
        const next = {
          x: Math.min(1, Math.max(0, cursor.x + arrow[0]! * step)),
          y: Math.min(1, Math.max(0, cursor.y + arrow[1]! * step))
        };
        setCursor(next);
        const size = viewportRef.current;
        if (size) {
          const moved = revealPoint(current, next, pageRef.current, size);
          if (moved !== current) moveView(moved);
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onPlacingChange(false);
        onDrop(cursor);
      }
      return;
    }
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? 200 : 60;
      moveView({
        ...current,
        tx: current.tx - arrow[0]! * step,
        ty: current.ty - arrow[1]! * step
      });
    } else if (event.key === '+' || event.key === '=') {
      const size = viewportRef.current!;
      moveView(zoomAt(current, { x: size.width / 2, y: size.height / 2 }, current.zoom * 1.25));
    } else if (event.key === '-') {
      const size = viewportRef.current!;
      moveView(zoomAt(current, { x: size.width / 2, y: size.height / 2 }, current.zoom / 1.25));
    }
  };

  const crosshair = placing && view ? pageToScreen(cursor, page, view) : null;

  return (
    <div
      ref={rootRef}
      data-testid='canvas'
      className='rl-canvas absolute inset-0 overflow-hidden'
      data-theme={theme}
      data-grab={spaceHeld || undefined}
      data-grabbing={grabbing || undefined}
      data-crosshair={!spaceHeld}
      tabIndex={0}
      role='group'
      aria-label={`${alt}. Click to drop a pin, or press C and use the arrow keys.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPointer(event)}
      onPointerCancel={(event) => endPointer(event, true)}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        // A long press shouldn't open the browser's image menu on phones.
        if ((event.nativeEvent as PointerEvent).pointerType === 'touch') {
          event.preventDefault();
        }
      }}
    >
      {view && viewport ? (
        <div
          data-testid='stage'
          className='rl-page-shadow absolute top-0 left-0 bg-white'
          style={{
            width: page.width,
            height: page.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <img
            key={page.id}
            src={page.url}
            alt={alt}
            width={page.width}
            height={page.height}
            draggable={false}
            className='block size-full max-w-none'
          />
        </div>
      ) : (
        // Before layout is known (server render), show the design at a sensible size.
        <img
          src={page.url}
          alt={alt}
          width={page.width}
          height={page.height}
          draggable={false}
          className='absolute inset-0 size-full object-contain object-top p-6'
        />
      )}

      {view
        ? pins.map((pin) => {
            const at = pageToScreen(pin, page, view);
            return (
              <button
                key={pin.id}
                type='button'
                data-pin={pin.id}
                data-testid='pin'
                data-page-x={pin.x}
                data-page-y={pin.y}
                data-selected={pin.selected}
                data-resolved={pin.resolved}
                data-internal={pin.internal}
                className='rl-pin'
                style={{ left: at.x, top: at.y }}
                aria-label={pin.title}
                aria-pressed={pin.selected}
                onClick={() => onSelectPin(pin.id)}
              >
                {pin.label}
              </button>
            );
          })
        : null}

      {view && pending ? (
        <span
          data-pin='pending'
          data-testid='pending-pin'
          data-pending='true'
          data-internal={pending.internal}
          data-selected='true'
          className='rl-pin'
          style={(() => {
            const at = pageToScreen(pending, page, view);
            return { left: at.x, top: at.y };
          })()}
        >
          {pending.label}
        </span>
      ) : null}

      {crosshair ? (
        <>
          <span
            aria-hidden
            className='pointer-events-none absolute w-px bg-pin'
            style={{ left: crosshair.x, top: crosshair.y - 14, height: 28 }}
          />
          <span
            aria-hidden
            className='pointer-events-none absolute h-px bg-pin'
            style={{ top: crosshair.y, left: crosshair.x - 14, width: 28 }}
          />
          <span role='status' className='sr-only'>
            Pin position {Math.round(cursor.x * 100)}% across, {Math.round(cursor.y * 100)}% down
          </span>
        </>
      ) : null}

      {placing && hint ? (
        <p className='pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white'>
          Click, or use arrow keys and Enter, to drop a pin. Esc cancels.
        </p>
      ) : null}
    </div>
  );
});
