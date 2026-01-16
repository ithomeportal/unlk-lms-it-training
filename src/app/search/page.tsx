import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SearchInterface } from './search-interface';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.name) redirect('/complete-profile');

  const { q } = await searchParams;

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-700 px-4">
          <SidebarTrigger className="-ml-1 text-slate-400 hover:text-white" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <h1 className="font-semibold text-white">AI-Powered Search</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <SearchInterface initialQuery={q} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
