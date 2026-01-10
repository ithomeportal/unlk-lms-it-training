import Link from 'next/link';
import { query } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CourseWithStats {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  is_mandatory: boolean;
  category_name: string | null;
  lesson_count: number;
  enrollment_count: number;
  created_at: string;
}

export default async function AdminCoursesPage() {
  const courses = await query<CourseWithStats>(`
    SELECT
      c.id, c.title, c.slug, c.is_published, c.is_mandatory,
      c.created_at,
      cat.name as category_name,
      (SELECT COUNT(*) FROM lessons WHERE course_id = c.id)::int as lesson_count,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id)::int as enrollment_count
    FROM courses c
    LEFT JOIN categories cat ON cat.id = c.category_id
    ORDER BY c.created_at DESC
  `);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Manage Courses</h1>
          <p className="text-slate-400">Create and manage training courses</p>
        </div>
        <Link href="/admin/courses/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Course
          </Button>
        </Link>
      </div>

      {courses.length > 0 ? (
        <div className="space-y-4">
          {courses.map((course) => (
            <Card key={course.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-white">{course.title}</h3>
                      {course.is_published ? (
                        <Badge className="bg-green-600">Published</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-600 text-slate-400">Draft</Badge>
                      )}
                      {course.is_mandatory && (
                        <Badge className="bg-amber-600">Required</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      {course.category_name && (
                        <span>{course.category_name}</span>
                      )}
                      <span>{course.lesson_count} lessons</span>
                      <span>{course.enrollment_count} enrolled</span>
                      <span>Created {new Date(course.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/courses/${course.id}`}>
                      <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/admin/courses/${course.id}/lessons`}>
                      <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                        Lessons
                      </Button>
                    </Link>
                    <Link href={`/courses/${course.slug}`} target="_blank">
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400 mb-4">No courses yet. Create your first course!</p>
            <Link href="/admin/courses/new">
              <Button className="bg-blue-600 hover:bg-blue-700">Create Course</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
