'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface ReportData {
  totalUsers: number;
  activeUsers: number;
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  completedEnrollments: number;
  totalLessons: number;
  lessonsCompleted: number;
  courseStats: Array<{
    id: string;
    title: string;
    enrollments: number;
    completions: number;
    completion_rate: number;
  }>;
  recentActivity: Array<{
    user_email: string;
    user_name: string | null;
    course_title: string;
    lesson_title: string;
    status: string;
    last_accessed_at: string;
  }>;
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const res = await fetch('/api/admin/reports');
      const result = await res.json();
      setData(result);
    } catch {
      console.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-slate-400">
        Failed to load reports
      </div>
    );
  }

  const overallCompletionRate = data.totalEnrollments > 0
    ? Math.round((data.completedEnrollments / data.totalEnrollments) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
        <p className="text-slate-400">Overview of platform usage and engagement</p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.totalUsers}</div>
            <p className="text-xs text-slate-500">{data.activeUsers} active</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.totalCourses}</div>
            <p className="text-xs text-slate-500">{data.publishedCourses} published</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Enrollments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.totalEnrollments}</div>
            <p className="text-xs text-slate-500">{data.completedEnrollments} completed</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{overallCompletionRate}%</div>
            <Progress value={overallCompletionRate} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Course Performance */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Course Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {data.courseStats.length > 0 ? (
            <div className="space-y-4">
              {data.courseStats.map((course) => (
                <div key={course.id} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{course.title}</p>
                    <p className="text-sm text-slate-400">
                      {course.enrollments} enrolled, {course.completions} completed
                    </p>
                  </div>
                  <div className="w-32">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Completion</span>
                      <span>{course.completion_rate}%</span>
                    </div>
                    <Progress value={course.completion_rate} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">No course data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-4 py-2 border-b border-slate-700 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">
                      {activity.user_name || activity.user_email}
                    </p>
                    <p className="text-sm text-slate-400 truncate">
                      {activity.course_title} - {activity.lesson_title}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded ${
                      activity.status === 'completed'
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-blue-600/20 text-blue-400'
                    }`}>
                      {activity.status}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(activity.last_accessed_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
