/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type * as React from 'react';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { NotFound } from '~/components/NotFound';
import { Toaster } from '~/components/ui/sonner';
import { TooltipProvider } from '~/components/ui/tooltip';
import { site } from '~/lib/site';
import { redline } from '~/redline.config';
import { seo } from '~/utils/seo';
import '~/styles/app.css';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  // Site-wide defaults; each page's `seo()` overrides tags with the same name.
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...(site.googleSiteVerification
        ? [
            {
              name: 'google-site-verification',
              content: site.googleSiteVerification
            }
          ]
        : []),
      ...seo({ title: site.name, description: site.description }).meta
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' }
    ]
  }),
  errorComponent: (props) => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent
});

function RootComponent() {
  // Lets end-to-end tests wait for React instead of guessing with timers.
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

/** Design tokens from src/redline.config.ts, for app.css to read. */
const TOKENS = `:root{${Object.entries({
  '--rl-accent': redline.colors.accent,
  '--rl-ink': redline.colors.ink,
  '--rl-ink-muted': redline.colors.inkMuted,
  '--rl-line': redline.colors.line,
  '--rl-paper': redline.colors.paper,
  '--rl-wash': redline.colors.wash,
  '--rl-internal': redline.colors.internal,
  '--rl-internal-wash': redline.colors.internalWash,
  '--rl-internal-line': redline.colors.internalLine,
  '--rl-canvas-light': redline.colors.canvasLight,
  '--rl-canvas-dark': redline.colors.canvasDark,
  '--rl-font-ui': redline.fonts.ui,
  '--rl-font-mono': redline.fonts.mono
})
  .map(([name, value]) => `${name}:${value}`)
  .join(';')}}`;

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: TOKENS }} />
      </head>
      <body>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}
