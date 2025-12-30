import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface DashboardStats {
  enrolled_courses: number;
  completed_courses: number;
  in_progress_courses: number;
  total_time_minutes: number;
}

interface RecentCourse {
  id: string;
  title: string;
  slug: string;
  progress_percent: number;
  last_accessed: string;
  thumbnail_url: string | null;
}

interface MandatoryCourse {
  id: string;
  title: string;
  slug: string;
  due_date: string;
  progress_percent: number;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Get dashboard stats
  const stats = await query<DashboardStats>(`
    SELECT
      COUNT(DISTINCT e.course_id) as enrolled_courses,
      COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.course_id END) as completed_courses,
      COUNT(DISTINCT CASE WHEN e.completed_at IS NULL THEN e.course_id END) as in_progress_courses,
      COALESCE(SUM(lp.time_spent_seconds) / 60, 0) as total_time_minutes
    FROM enrollments e
    LEFT JOIN lesson_progress lp ON lp.user_id = e.user_id
    WHERE e.user_id = $1
  `, [user.id]);

  const dashboardStats = stats[0] || {
    enrolled_courses: 0,
    completed_courses: 0,
    in_progress_courses: 0,
    total_time_minutes: 0
  };

  // Get recent courses
  const recentCourses = await query<RecentCourse>(`
    SELECT DISTINCT ON (c.id)
      c.id, c.title, c.slug, c.thumbnail_url,
      COALESCE(
        (SELECT AVG(COALESCE(lp.progress_percent, 0))
         FROM lessons l
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         WHERE l.course_id = c.id),
        0
      )::int as progress_percent,
      COALESCE(MAX(lp.last_accessed_at), e.enrolled_at) as last_accessed
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN lesson_progress lp ON lp.course_id = c.id AND lp.user_id = e.user_id
    WHERE e.user_id = $1 AND c.is_published = true
    GROUP BY c.id, c.title, c.slug, c.thumbnail_url, e.enrolled_at
    ORDER BY c.id, last_accessed DESC
    LIMIT 4
  `, [user.id]);

  // Get mandatory courses with upcoming deadlines
  const mandatoryCourses = await query<MandatoryCourse>(`
    SELECT
      c.id, c.title, c.slug,
      ma.due_date,
      COALESCE(
        (SELECT AVG(COALESCE(lp.progress_percent, 0))
         FROM lessons l
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         WHERE l.course_id = c.id),
        0
      )::int as progress_percent
    FROM mandatory_assignments ma
    JOIN courses c ON c.id = ma.course_id
    WHERE c.is_published = true
      AND ma.due_date > NOW()
      AND (
        ma.assigned_to = 'all'
        OR (ma.assigned_to = 'domain' AND $2 LIKE '%' || ma.domain_filter)
        OR (ma.assigned_to = 'specific' AND $1 = ANY(ma.user_ids))
      )
    ORDER BY ma.due_date ASC
    LIMIT 3
  `, [user.id, user.email]);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDueDate = (date: string) => {
    const dueDate = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${dueDate.toLocaleDateString()}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {user.name || user.email.split('@')[0]}
        </h1>
        <p className="text-slate-400 mt-1">Track your learning progress and continue where you left off.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Enrolled Courses</CardDescription>
            <CardTitle className="text-3xl text-white">{dashboardStats.enrolled_courses}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Completed</CardDescription>
            <CardTitle className="text-3xl text-green-400">{dashboardStats.completed_courses}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">In Progress</CardDescription>
            <CardTitle className="text-3xl text-blue-400">{dashboardStats.in_progress_courses}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400">Time Spent</CardDescription>
            <CardTitle className="text-3xl text-white">{formatTime(Number(dashboardStats.total_time_minutes))}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Mandatory Courses Alert */}
      {mandatoryCourses.length > 0 && (
        <Card className="bg-amber-900/20 border-amber-700/50">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Required Training
            </CardTitle>
            <CardDescription className="text-amber-200/70">
              Complete these courses by their due dates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mandatoryCourses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-white">{course.title}</p>
                    <p className="text-sm text-amber-400">{formatDueDate(course.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <Progress value={course.progress_percent} className="h-2" />
                    </div>
                    <span className="text-sm text-slate-400 w-12 text-right">{course.progress_percent}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue Learning */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Continue Learning</h2>
        {recentCourses.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {recentCourses.map((course) => (
              <Link key={course.id} href={`/courses/${course.slug}`}>
                <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors h-full">
                  <div className="aspect-video bg-gradient-to-br from-blue-600 to-indigo-700 relative">
                    {course.thumbnail_url && (
                      <img
                        src={course.thumbnail_url}
                        alt={course.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80">
                      <Progress value={course.progress_percent} className="h-1" />
                    </div>
                  </div>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base text-white line-clamp-2">{course.title}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {course.progress_percent}% complete
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12 text-center">
              <p className="text-slate-400 mb-4">You haven&apos;t enrolled in any courses yet.</p>
              <Link href="/courses" className="text-blue-400 hover:text-blue-300 font-medium">
                Browse available courses →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/courses">
          <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-white">Browse Courses</h3>
                <p className="text-sm text-slate-400">Explore available training</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/search">
          <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-white">AI Search</h3>
                <p className="text-sm text-slate-400">Find anything instantly</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/profile">
          <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-600/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-white">My Profile</h3>
                <p className="text-sm text-slate-400">View your progress</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
