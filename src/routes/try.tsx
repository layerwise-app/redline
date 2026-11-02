import { createFileRoute, Outlet } from '@tanstack/react-router';
import { seo } from '~/utils/seo';

// Try mode lives in this browser's storage, so it renders in the browser only.
export const Route = createFileRoute('/try')({
  ssr: false,
  head: () =>
    seo({
      title: 'Try Redline with sample data',
      description:
        'Explore Redline with a sample studio: reviews, Inbox, team view, and the client’s view. Nothing leaves your browser.',
      path: '/try'
    }),
  component: Outlet
});
