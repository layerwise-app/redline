import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { getAuthSession } from '~/lib/auth.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ location }) => {
    const session = await getAuthSession();
    if (!session) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.pathname }
      });
    }
    return { user: session.user };
  },
  head: () => seo({ title: 'Redline', noindex: true }),
  component: Outlet
});
