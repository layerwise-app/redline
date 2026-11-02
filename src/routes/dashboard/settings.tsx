import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '~/components/app/AppShell';
import { SettingsView } from '~/components/app/SettingsView';
import { serverTeamApi } from '~/client/server-api';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/settings')({
  head: () => seo({ title: 'Settings · Redline', noindex: true }),
  component: () => (
    <AppShell api={serverTeamApi}>
      <SettingsView api={serverTeamApi} />
    </AppShell>
  )
});
