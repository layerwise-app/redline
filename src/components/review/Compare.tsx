import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AssetDTO, PageDTO } from '~/domain/dto';
import { clampZoom, zoomAt, type Point, type View } from '~/lib/redline/geometry';
import { Button } from '~/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { useIsMobile } from '~/hooks/use-mobile';

type Mode = 'side' | 'slider';

/** Both sides share one view, so the same spot of each design stays lined up. */
function useSharedView(ref: React.RefObject<HTMLDivElement | null>) {
  const [view, setView] = useState<View>({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = viewRef.current;
      if (!event.ctrlKey && !event.metaKey && event.deltaX !== 0) {
        setView({
          ...current,
          tx: current.tx - event.deltaX,
          ty: current.ty - event.deltaY
        });
        return;
      }
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const speed = event.ctrlKey ? 0.01 : 0.0022;
      setView(zoomAt(current, anchor, current.zoom * Math.exp(-event.deltaY * speed)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
  return [view, setView] as const;
}

function ComparePane({
  page,
  width,
  view,
  label
}: {
  page: PageDTO;
  width: number;
  view: View;
  label: string;
}) {
  return (
    <div
      className='absolute top-0 left-0'
      style={{
        width,
        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
        transformOrigin: '0 0'
      }}
    >
      <img
        src={page.url}
        alt={label}
        draggable={false}
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
        className='rl-page-shadow block h-auto w-full max-w-none bg-white'
      />
    </div>
  );
}

function Tag({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span
      className={`rl-num pointer-events-none absolute top-2 z-10 rounded-sm bg-ink px-1.5 py-0.5 text-xs text-white ${className}`}
    >
      {children}
    </span>
  );
}

export function Compare({
  asset,
  theme,
  initialB,
  onClose
}: {
  asset: AssetDTO;
  theme: 'light' | 'dark';
  initialB: string;
  onClose(): void;
}) {
  const versions = asset.versions;
  const defaultA =
    versions.find((version) => version.id !== initialB)?.id ?? initialB;
  const [aId, setAId] = useState(defaultA);
  const [bId, setBId] = useState(initialB);
  const [mode, setMode] = useState<Mode>('slider');
  const [pageNumber, setPageNumber] = useState(1);
  const [split, setSplit] = useState(50);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useSharedView(rootRef);
  const isMobile = useIsMobile();

  const a = versions.find((version) => version.id === aId) ?? versions[0]!;
  const b = versions.find((version) => version.id === bId) ?? versions[versions.length - 1]!;
  const pageCount = Math.max(a.pages.length, b.pages.length);
  const pageA = a.pages[Math.min(pageNumber, a.pages.length) - 1]!;
  const pageB = b.pages[Math.min(pageNumber, b.pages.length) - 1]!;

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const stacked = mode === 'side' && isMobile;
  const paneWidth =
    mode === 'side' && !stacked ? (size.width - 1) / 2 : size.width;
  const paneHeight = stacked ? (size.height - 1) / 2 : size.height;
  // Fit both designs to the pane's width with a small margin.
  const baseWidth = useMemo(() => Math.max(1, paneWidth - 32), [paneWidth]);
  // A design shorter than the pane sits in the middle of it.
  const baseHeight = (baseWidth * pageB.height) / pageB.width;
  const shared: View = {
    zoom: view.zoom,
    tx: view.tx + 16,
    ty: view.ty + Math.max(16, (paneHeight - baseHeight) / 2)
  };

  // Drag anywhere to pan both sides together.
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    drag.current = { x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setView({
      ...drag.current.view,
      tx: drag.current.view.tx + event.clientX - drag.current.x,
      ty: drag.current.view.ty + event.clientY - drag.current.y
    });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const zoomButton = (factor: number) => {
    const anchor: Point = { x: size.width / 2, y: size.height / 2 };
    setView(zoomAt(view, anchor, clampZoom(view.zoom * factor)));
  };

  return (
    <div
      role='dialog'
      aria-label={`Compare versions of ${asset.name}`}
      data-testid='compare'
      className='absolute inset-0 z-20 flex flex-col bg-paper max-md:fixed max-md:z-40'
    >
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2'>
        <span className='font-medium'>Compare</span>
        <label className='flex items-center gap-1.5 text-xs text-ink-muted'>
          From
          <select
            data-testid='compare-a'
            className='h-8 rounded border border-input bg-paper px-1.5 text-sm text-ink'
            value={aId}
            onChange={(event) => setAId(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                V{version.number}
              </option>
            ))}
          </select>
        </label>
        <label className='flex items-center gap-1.5 text-xs text-ink-muted'>
          To
          <select
            data-testid='compare-b'
            className='h-8 rounded border border-input bg-paper px-1.5 text-sm text-ink'
            value={bId}
            onChange={(event) => setBId(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                V{version.number}
              </option>
            ))}
          </select>
        </label>
        {pageCount > 1 ? (
          <label className='flex items-center gap-1.5 text-xs text-ink-muted'>
            Page
            <select
              className='h-8 rounded border border-input bg-paper px-1.5 text-sm text-ink'
              value={pageNumber}
              onChange={(event) => setPageNumber(Number(event.target.value))}
            >
              {Array.from({ length: pageCount }, (_, index) => (
                <option key={index} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ToggleGroup
          type='single'
          variant='outline'
          size='sm'
          value={mode}
          onValueChange={(value) => value && setMode(value as Mode)}
          aria-label='Compare mode'
        >
          <ToggleGroupItem value='side'>Side by side</ToggleGroupItem>
          <ToggleGroupItem value='slider'>Slider</ToggleGroupItem>
        </ToggleGroup>
        <div className='ml-auto flex items-center gap-1'>
          <Button type='button' variant='ghost' size='sm' aria-label='Zoom out' onClick={() => zoomButton(1 / 1.25)}>
            −
          </Button>
          <Button type='button' variant='ghost' size='sm' aria-label='Zoom in' onClick={() => zoomButton(1.25)}>
            +
          </Button>
          <Button type='button' variant='ghost' size='sm' onClick={() => setView({ zoom: 1, tx: 0, ty: 0 })}>
            Fit
          </Button>
          <Button type='button' variant='ghost' size='icon-sm' aria-label='Close compare' onClick={onClose}>
            <X aria-hidden className='size-4' />
          </Button>
        </div>
      </div>

      <div
        ref={rootRef}
        className='rl-canvas relative min-h-0 flex-1 overflow-hidden'
        data-theme={theme}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {size.width > 0 && mode === 'side' ? (
          <div className={stacked ? 'flex h-full flex-col' : 'flex h-full'}>
            {[
              { page: pageA, version: a },
              { page: pageB, version: b }
            ].map(({ page, version }, index) => (
              <div
                key={index}
                data-testid={`compare-pane-${index}`}
                className='relative overflow-hidden'
                style={{ width: paneWidth, height: paneHeight, ...(index === 0 ? stacked ? { borderBottom: '1px solid var(--rl-line)' } : { borderRight: '1px solid var(--rl-line)' } : {}) }}
              >
                <Tag className='left-2'>{`V${version.number}`}</Tag>
                <ComparePane
                  page={page}
                  width={baseWidth}
                  view={shared}
                  label={`${asset.name}, version ${version.number}, page ${page.number}`}
                />
              </div>
            ))}
          </div>
        ) : null}

        {size.width > 0 && mode === 'slider' ? (
          <>
            <Tag className='left-2'>{`V${a.number}`}</Tag>
            <Tag className='right-2'>{`V${b.number}`}</Tag>
            <ComparePane
              page={pageA}
              width={baseWidth}
              view={shared}
              label={`${asset.name}, version ${a.number}, page ${pageA.number}`}
            />
            <div
              data-testid='compare-top'
              className='absolute inset-0'
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            >
              <ComparePane
                page={pageB}
                width={baseWidth}
                view={shared}
                label={`${asset.name}, version ${b.number}, page ${pageB.number}`}
              />
            </div>
            <span
              aria-hidden
              className='pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_#fff]'
              style={{ left: `${split}%` }}
            />
            <input
              type='range'
              min={0}
              max={100}
              step={1}
              value={split}
              data-testid='compare-slider'
              aria-label={`Slide between version ${a.number} and version ${b.number}`}
              className='rl-compare-range absolute inset-x-0 top-1/2 h-11 w-full -translate-y-1/2'
              onChange={(event) => setSplit(Number(event.target.value))}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
