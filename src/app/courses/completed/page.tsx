import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface CompletedCourse {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
  completed_at: string;
  total_lessons: number;
}

export default async function CompletedCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.name) redirect('/complete-profile');

  const completedCourses = await query<CompletedCourse>(`
    SELECT
      c.id, c.title, c.slug, c.thumbnail_url, e.completed_at,
      (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = $1 AND e.completed_at IS NOT NULL
    ORDER BY e.completed_at DESC
  `, [user.id]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-700 px-4">
          <SidebarTrigger className="-ml-1 text-slate-400 hover:text-white" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <h1 className="font-semibold text-white">Completed Courses</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Your Achievements
              </h2>
              <p className="text-slate-400">Courses you have successfully completed</p>
            </div>

            {completedCourses.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedCourses.map((course) => (
                  <Link key={course.id} href={`/courses/${course.slug}`}>
                    <Card className="bg-green-900/20 border-green-700/30 hover:bg-green-900/30 transition-colors h-full">
                      <div className="aspect-video relative overflow-hidden rounded-t-lg">
                        {course.thumbnail_url ? (
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center">
                            <svg className="w-12 h-12 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-white mb-2 line-clamp-2">{course.title}</h3>
                        <div className="flex items-center justify-between">
                          <Badge className="bg-green-600">Completed</Badge>
                          <span className="text-sm text-green-400">
                            {formatDate(course.completed_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-2">
                          {course.total_lessons} lessons completed
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <p className="text-slate-400 mb-4">No completed courses yet</p>
                  <Link href="/courses/progress" className="text-blue-400 hover:text-blue-300">
                    View courses in progress →
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
