import { createFileRoute } from '@tanstack/react-router';
import { demoTeamApi } from '~/client/demo';
import { AppShell } from '~/components/app/AppShell';
import { SettingsView } from '~/components/app/SettingsView';
import { TryBanner } from '~/components/app/TryBanner';

export const Route = createFileRoute('/try/settings')({
  component: () => (
    <AppShell api={demoTeamApi} banner={<TryBanner />}>
      <SettingsView api={demoTeamApi} />
    </AppShell>
  )
});
