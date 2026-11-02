import { createFileRoute } from '@tanstack/react-router';
import { demoTeamApi } from '~/client/demo';
import { AppShell } from '~/components/app/AppShell';
import { InboxView } from '~/components/app/InboxView';
import { TryBanner } from '~/components/app/TryBanner';

export const Route = createFileRoute('/try/inbox')({
  component: () => (
    <AppShell api={demoTeamApi} banner={<TryBanner />}>
      <InboxView api={demoTeamApi} />
    </AppShell>
  )
});
