import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';

interface CourseWithProgress {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_minutes: number;
  is_mandatory: boolean;
  category_name: string | null;
  category_slug: string | null;
  lesson_count: number;
  is_enrolled: boolean;
  progress_percent: number;
}

interface Category {
  slug: string;
  name: string;
  course_count: number;
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const categoryFilter = params.category;

  // Get categories
  const categories = await query<Category>(`
    SELECT c.slug, c.name, COUNT(co.id)::int as course_count
    FROM categories c
    LEFT JOIN courses co ON co.category_id = c.id AND co.is_published = true
    GROUP BY c.id, c.slug, c.name
    ORDER BY c.sort_order, c.name
  `);

  // Get courses
  const courses = await query<CourseWithProgress>(`
    SELECT
      c.id, c.title, c.slug, c.description, c.thumbnail_url,
      c.duration_minutes, c.is_mandatory,
      cat.name as category_name, cat.slug as category_slug,
      (SELECT COUNT(*) FROM lessons WHERE course_id = c.id)::int as lesson_count,
      EXISTS(SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = c.id) as is_enrolled,
      COALESCE(
        (SELECT AVG(COALESCE(lp.progress_percent, 0))
         FROM lessons l
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         WHERE l.course_id = c.id),
        0
      )::int as progress_percent
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.is_published = true
      ${categoryFilter ? 'AND cat.slug = $2' : ''}
    ORDER BY c.is_mandatory DESC, c.title
  `, categoryFilter ? [user.id, categoryFilter] : [user.id]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-700 px-4">
          <SidebarTrigger className="-ml-1 text-slate-400 hover:text-white" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <h1 className="font-semibold text-white">Course Catalog</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[120rem] mx-auto">
            {/* Category Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
              <Link href="/courses">
                <Badge
                  variant={!categoryFilter ? 'default' : 'outline'}
                  className={!categoryFilter
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  }
                >
                  All Courses
                </Badge>
              </Link>
              {categories.map((cat) => (
                <Link key={cat.slug} href={`/courses?category=${cat.slug}`}>
                  <Badge
                    variant={categoryFilter === cat.slug ? 'default' : 'outline'}
                    className={categoryFilter === cat.slug
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    }
                  >
                    {cat.name} ({cat.course_count})
                  </Badge>
                </Link>
              ))}
            </div>

            {/* Course Grid */}
            {courses.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {courses.map((course) => (
                  <Link key={course.id} href={`/courses/${course.slug}`}>
                    <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-all hover:shadow-lg h-full flex flex-col group">
                      <div className="aspect-video bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 relative rounded-t-lg overflow-hidden">
                        {course.thumbnail_url ? (
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            {/* Decorative background pattern */}
                            <div className="absolute inset-0 opacity-10">
                              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <defs>
                                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
                                  </pattern>
                                </defs>
                                <rect width="100" height="100" fill="url(#grid)" />
                              </svg>
                            </div>
                            {/* Course icon */}
                            <div className="relative z-10 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
                              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            {/* Decorative circles */}
                            <div className="absolute top-4 left-4 w-16 h-16 rounded-full bg-white/5"></div>
                            <div className="absolute bottom-4 right-4 w-24 h-24 rounded-full bg-white/5"></div>
                          </div>
                        )}
                        {course.is_mandatory && (
                          <Badge className="absolute top-2 right-2 bg-amber-600">Required</Badge>
                        )}
                        {course.is_enrolled && course.progress_percent > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80">
                            <Progress value={course.progress_percent} className="h-1.5" />
                          </div>
                        )}
                      </div>
                      <CardHeader className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {course.category_name && (
                            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                              {course.category_name}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg text-white line-clamp-2">
                          {course.title}
                        </CardTitle>
                        {course.description && (
                          <CardDescription className="text-slate-400 line-clamp-2">
                            {course.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-sm text-slate-400">
                          <span>{course.lesson_count} lessons</span>
                          <span>{formatDuration(course.duration_minutes)}</span>
                        </div>
                        {course.is_enrolled && (
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={course.progress_percent} className="h-1.5 flex-1" />
                            <span className="text-xs text-slate-400">{course.progress_percent}%</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <p className="text-slate-400">No courses available in this category.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
