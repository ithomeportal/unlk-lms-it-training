import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { ProfileEditor } from '@/components/profile/profile-editor';
import { SearchHistorySection } from '@/components/profile/search-history-section';
import Link from 'next/link';

interface UserStats {
  enrolled_courses: number;
  completed_courses: number;
  lessons_completed: number;
  total_time_minutes: number;
}

interface CompletedCourse {
  id: string;
  title: string;
  slug: string;
  completed_at: string;
  thumbnail_url: string | null;
}

interface InProgressCourse {
  id: string;
  title: string;
  slug: string;
  progress_percent: number;
  last_accessed: string;
}

interface SearchHistoryItem {
  id: string;
  query: string;
  ai_answer: string;
  result_count: number;
  searched_at: string;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Get user stats
  const statsResult = await query<UserStats>(`
    SELECT
      COUNT(DISTINCT e.course_id) as enrolled_courses,
      COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.course_id END) as completed_courses,
      (SELECT COUNT(*) FROM lesson_progress WHERE user_id = $1 AND status = 'completed') as lessons_completed,
      COALESCE((SELECT SUM(time_spent_seconds) / 60 FROM lesson_progress WHERE user_id = $1), 0) as total_time_minutes
    FROM enrollments e
    WHERE e.user_id = $1
  `, [user.id]);

  const stats = statsResult[0] || {
    enrolled_courses: 0,
    completed_courses: 0,
    lessons_completed: 0,
    total_time_minutes: 0
  };

  // Get completed courses
  const completedCourses = await query<CompletedCourse>(`
    SELECT c.id, c.title, c.slug, c.thumbnail_url, e.completed_at
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = $1 AND e.completed_at IS NOT NULL
    ORDER BY e.completed_at DESC
    LIMIT 10
  `, [user.id]);

  // Get in-progress courses
  const inProgressCourses = await query<InProgressCourse>(`
    SELECT
      c.id, c.title, c.slug,
      COALESCE(
        (SELECT AVG(COALESCE(lp.progress_percent, 0))
         FROM lessons l
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         WHERE l.course_id = c.id),
        0
      )::int as progress_percent,
      COALESCE(
        (SELECT MAX(last_accessed_at) FROM lesson_progress WHERE course_id = c.id AND user_id = $1),
        e.enrolled_at
      ) as last_accessed
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = $1 AND e.completed_at IS NULL AND c.is_published = true
    ORDER BY last_accessed DESC
  `, [user.id]);

  // Get search history
  const searchHistory = await query<SearchHistoryItem>(`
    SELECT id, query, ai_answer, result_count, searched_at
    FROM search_history
    WHERE user_id = $1
    ORDER BY searched_at DESC
    LIMIT 10
  `, [user.id]);

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-700 px-4">
          <SidebarTrigger className="-ml-1 text-slate-400 hover:text-white" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <h1 className="font-semibold text-white">My Profile</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Profile Header */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-blue-600 text-white text-2xl">
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-white">
                          {user.name || user.email.split('@')[0]}
                        </h2>
                        <p className="text-slate-400">{user.email}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="border-slate-600 text-slate-300">
                            {user.role === 'admin' ? 'Administrator' : 'Learner'}
                          </Badge>
                          <span className="text-sm text-slate-500">
                            Member since {formatDate(user.created_at)}
                          </span>
                        </div>
                      </div>
                      <ProfileEditor currentName={user.name} email={user.email} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate-400">Courses Enrolled</CardDescription>
                  <CardTitle className="text-3xl text-white">{stats.enrolled_courses}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate-400">Completed</CardDescription>
                  <CardTitle className="text-3xl text-green-400">{stats.completed_courses}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate-400">Lessons Done</CardDescription>
                  <CardTitle className="text-3xl text-blue-400">{stats.lessons_completed}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate-400">Learning Time</CardDescription>
                  <CardTitle className="text-2xl text-white">{formatTime(Number(stats.total_time_minutes))}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* In Progress Courses */}
            {inProgressCourses.length > 0 && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">In Progress</CardTitle>
                  <CardDescription className="text-slate-400">
                    Continue where you left off
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {inProgressCourses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/courses/${course.slug}`}
                        className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{course.title}</p>
                          <p className="text-sm text-slate-400">
                            Last accessed {formatDate(course.last_accessed)}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          <div className="w-32">
                            <Progress value={course.progress_percent} className="h-2" />
                          </div>
                          <span className="text-sm text-slate-300 w-12 text-right">
                            {course.progress_percent}%
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completed Courses */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  Completed Courses
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Your achievements
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completedCourses.length > 0 ? (
                  <div className="space-y-3">
                    {completedCourses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/courses/${course.slug}`}
                        className="flex items-center justify-between p-4 bg-green-900/20 border border-green-700/30 rounded-lg hover:bg-green-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-white">{course.title}</p>
                            <p className="text-sm text-green-400">
                              Completed {formatDate(course.completed_at)}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-green-600">Completed</Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-400 mb-4">No completed courses yet</p>
                    <Link href="/courses" className="text-blue-400 hover:text-blue-300">
                      Start learning →
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Search History */}
            <SearchHistorySection initialHistory={searchHistory} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
