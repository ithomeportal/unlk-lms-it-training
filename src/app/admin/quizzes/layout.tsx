import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canManage } from '@/lib/permissions';

/**
 * Management section — WRITE capable. The parent /admin layout admits
 * read-only roles (auditor), so this section must gate again on `canManage`.
 * Every page below here is a client component, which is why the guard lives
 * in a server layout rather than in the pages themselves.
 */
export default async function ManageSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!canManage(user)) {
    redirect('/admin/analytics');
  }

  return <>{children}</>;
}
