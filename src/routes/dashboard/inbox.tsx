import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '~/components/app/AppShell';
import { InboxView } from '~/components/app/InboxView';
import { serverTeamApi } from '~/client/server-api';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/inbox')({
  head: () => seo({ title: 'Inbox · Redline', noindex: true }),
  component: () => (
    <AppShell api={serverTeamApi}>
      <InboxView api={serverTeamApi} />
    </AppShell>
  )
});
