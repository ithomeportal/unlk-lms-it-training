import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SearchHistorySection } from '@/components/profile/search-history-section';

interface SearchHistoryItem {
  id: string;
  query: string;
  ai_answer: string;
  result_count: number;
  searched_at: string;
}

export default async function SearchHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.name) redirect('/complete-profile');

  const searchHistory = await query<SearchHistoryItem>(`
    SELECT id, query, ai_answer, result_count, searched_at
    FROM search_history
    WHERE user_id = $1
    ORDER BY searched_at DESC
    LIMIT 50
  `, [user.id]);

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-700 px-4">
          <SidebarTrigger className="-ml-1 text-slate-400 hover:text-white" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <h1 className="font-semibold text-white">Search History</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <SearchHistorySection initialHistory={searchHistory} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
