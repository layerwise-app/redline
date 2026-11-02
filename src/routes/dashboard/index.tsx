import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '~/components/app/AppShell';
import { DashboardView } from '~/components/app/DashboardView';
import { serverTeamApi } from '~/client/server-api';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/')({
  head: () => seo({ title: 'Reviews · Redline', noindex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ['reviews', 'server'],
        queryFn: serverTeamApi.listReviews
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['shell', 'server'],
        queryFn: serverTeamApi.getShell
      })
    ]);
  },
  component: () => (
    <AppShell api={serverTeamApi}>
      <DashboardView api={serverTeamApi} />
    </AppShell>
  )
});
