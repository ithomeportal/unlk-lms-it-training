import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function QuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Redirect to complete profile if user hasn't set their name
  if (!user.name) {
    redirect('/complete-profile');
  }

  return <>{children}</>;
}
