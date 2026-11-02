import { createFileRoute } from '@tanstack/react-router';
import { demoTeamApi } from '~/client/demo';
import { AppShell } from '~/components/app/AppShell';
import { DashboardView } from '~/components/app/DashboardView';
import { TryBanner } from '~/components/app/TryBanner';

export const Route = createFileRoute('/try/')({
  component: () => (
    <AppShell api={demoTeamApi} banner={<TryBanner />}>
      <DashboardView api={demoTeamApi} />
    </AppShell>
  )
});
