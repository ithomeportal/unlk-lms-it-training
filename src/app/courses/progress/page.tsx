import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface InProgressCourse {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
  progress_percent: number;
  lessons_completed: number;
  total_lessons: number;
  last_accessed: string;
}

export default async function MyProgressPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.name) redirect('/complete-profile');

  const inProgressCourses = await query<InProgressCourse>(`
    SELECT
      c.id, c.title, c.slug, c.thumbnail_url,
      COALESCE(
        (SELECT AVG(COALESCE(lp.progress_percent, 0))
         FROM lessons l
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         WHERE l.course_id = c.id),
        0
      )::int as progress_percent,
      (SELECT COUNT(*) FROM lesson_progress lp
       JOIN lessons l ON l.id = lp.lesson_id
       WHERE l.course_id = c.id AND lp.user_id = $1 AND lp.status = 'completed') as lessons_completed,
      (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
      COALESCE(
        (SELECT MAX(last_accessed_at) FROM lesson_progress WHERE course_id = c.id AND user_id = $1),
        e.enrolled_at
      ) as last_accessed
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = $1 AND e.completed_at IS NULL AND c.is_published = true
    ORDER BY last_accessed DESC
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
          <h1 className="font-semibold text-white">My Progress</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Courses In Progress</h2>
              <p className="text-slate-400">Continue where you left off</p>
            </div>

            {inProgressCourses.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inProgressCourses.map((course) => (
                  <Link key={course.id} href={`/courses/${course.slug}`}>
                    <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors h-full">
                      <div className="aspect-video relative overflow-hidden rounded-t-lg">
                        {course.thumbnail_url ? (
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                            <svg className="w-12 h-12 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2">
                          <Badge className="bg-blue-600">{course.progress_percent}%</Badge>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-white mb-2 line-clamp-2">{course.title}</h3>
                        <div className="space-y-3">
                          <Progress value={course.progress_percent} className="h-2" />
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">
                              {course.lessons_completed}/{course.total_lessons} lessons
                            </span>
                            <span className="text-slate-500">
                              {formatDate(course.last_accessed)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-slate-400 mb-4">No courses in progress</p>
                  <Link href="/courses" className="text-blue-400 hover:text-blue-300">
                    Browse course catalog →
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
