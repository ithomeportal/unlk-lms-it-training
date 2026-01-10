'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface LoginHistoryItem {
  id: string;
  logged_in_at: string;
  logged_out_at: string | null;
  session_duration_seconds: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface LessonProgress {
  lesson_id: string;
  lesson_title: string;
  content_type: string;
  duration_minutes: number;
  min_required_seconds: number;
  status: string;
  time_spent_seconds: number;
  is_time_validated: boolean;
  completed_at: string | null;
  last_accessed_at: string | null;
}

interface CourseProgress {
  course_id: string;
  course_title: string;
  enrolled_at: string;
  completed_at: string | null;
  total_lessons: number;
  completed_lessons: number;
  validated_completed_lessons: number;
  progress_percent: number;
  validated_progress_percent: number;
  total_time_spent_seconds: number;
  lessons: LessonProgress[];
}

interface QuizAttempt {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  course_title: string;
  started_at: string;
  submitted_at: string | null;
  status: string;
  score: number | null;
  passed: boolean | null;
  passing_score: number;
  time_spent_seconds: number | null;
  total_questions: number;
}

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface Summary {
  total_logins: number;
  total_session_time_seconds: number;
  courses_enrolled: number;
  courses_completed: number;
  courses_in_progress: number;
  overall_progress_percent: number;
  validated_progress_percent: number;
  total_learning_time_seconds: number;
  quizzes_taken: number;
  quizzes_passed: number;
  average_quiz_score: number | null;
}

export default function UserAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const router = useRouter();
  const { userId } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [coursesProgress, setCoursesProgress] = useState<CourseProgress[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses' | 'quizzes' | 'logins'>('overview');

  useEffect(() => {
    loadUserAnalytics();
  }, [userId]);

  const loadUserAnalytics = async () => {
    try {
      const res = await fetch(`/api/admin/analytics/${userId}`);
      if (!res.ok) {
        router.push('/admin/analytics');
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setLoginHistory(data.loginHistory || []);
      setCoursesProgress(data.coursesProgress || []);
      setQuizAttempts(data.quizAttempts || []);
      setSummary(data.summary || null);
    } catch {
      console.error('Failed to load user analytics');
      router.push('/admin/analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const parseBrowser = (userAgent: string | null): string => {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-slate-400">
        User not found
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back button and header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin/analytics')}
          className="text-slate-400 hover:text-white"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
      </div>

      {/* User Header */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-blue-600 text-white text-xl">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">
                  {user.name || user.email.split('@')[0]}
                </h1>
                <Badge
                  variant="outline"
                  className={`${
                    user.role === 'super_admin'
                      ? 'border-red-500 text-red-400'
                      : user.role === 'admin'
                      ? 'border-purple-500 text-purple-400'
                      : 'border-slate-600 text-slate-400'
                  }`}
                >
                  {user.role}
                </Badge>
                {!user.is_active && (
                  <Badge variant="outline" className="border-red-500 text-red-400">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-slate-400">{user.email}</p>
              <div className="flex gap-6 mt-4 text-sm">
                <div>
                  <span className="text-slate-500">Joined:</span>{' '}
                  <span className="text-slate-300">{formatDate(user.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Last Login:</span>{' '}
                  <span className="text-slate-300">{formatDate(user.last_login_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Total Logins</p>
              <p className="text-2xl font-bold text-white">{summary.total_logins}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Session Time</p>
              <p className="text-2xl font-bold text-white">{formatDuration(summary.total_session_time_seconds)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Courses</p>
              <p className="text-2xl font-bold text-white">{summary.courses_completed}/{summary.courses_enrolled}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Progress</p>
              <p className="text-2xl font-bold text-white">{summary.overall_progress_percent}%</p>
              <p className="text-xs text-slate-500">{summary.validated_progress_percent}% validated</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Learning Time</p>
              <p className="text-2xl font-bold text-white">{formatDuration(summary.total_learning_time_seconds)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-400">Quizzes</p>
              <p className="text-2xl font-bold text-white">{summary.quizzes_passed}/{summary.quizzes_taken}</p>
              {summary.average_quiz_score !== null && (
                <p className="text-xs text-slate-500">Avg: {summary.average_quiz_score}%</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {(['overview', 'courses', 'quizzes', 'logins'] as const).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? 'bg-blue-600' : 'text-slate-400'}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Courses */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Course Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {coursesProgress.length > 0 ? (
                <div className="space-y-4">
                  {coursesProgress.slice(0, 5).map((course) => (
                    <div key={course.course_id} className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-white text-sm truncate">{course.course_title}</span>
                        <span className="text-slate-400 text-sm">
                          {course.completed_lessons}/{course.total_lessons}
                        </span>
                      </div>
                      <Progress value={course.progress_percent} className="h-2" />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{course.progress_percent}% complete</span>
                        <span>{course.validated_progress_percent}% validated</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-4">No courses enrolled</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Quizzes */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Quizzes</CardTitle>
            </CardHeader>
            <CardContent>
              {quizAttempts.length > 0 ? (
                <div className="space-y-3">
                  {quizAttempts.slice(0, 5).map((attempt) => (
                    <div key={attempt.attempt_id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                      <div>
                        <p className="text-white text-sm">{attempt.quiz_title}</p>
                        <p className="text-xs text-slate-500">{formatDate(attempt.submitted_at || attempt.started_at)}</p>
                      </div>
                      {attempt.status === 'completed' ? (
                        <Badge
                          variant="outline"
                          className={attempt.passed ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}
                        >
                          {Math.round(attempt.score || 0)}%
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                          In Progress
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-4">No quiz attempts</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'courses' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Course Progress Details</CardTitle>
          </CardHeader>
          <CardContent>
            {coursesProgress.length > 0 ? (
              <Accordion type="single" collapsible className="space-y-2">
                {coursesProgress.map((course) => (
                  <AccordionItem key={course.course_id} value={course.course_id} className="border-slate-700">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-4 w-full">
                        <div className="flex-1 text-left">
                          <p className="text-white font-medium">{course.course_title}</p>
                          <p className="text-xs text-slate-500">
                            Enrolled: {formatDate(course.enrolled_at)}
                            {course.completed_at && ` | Completed: ${formatDate(course.completed_at)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-white">{course.progress_percent}%</p>
                            <p className="text-xs text-slate-500">{course.validated_progress_percent}% validated</p>
                          </div>
                          <div className="w-24">
                            <Progress value={course.progress_percent} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-2 pb-4 space-y-2">
                        <div className="grid grid-cols-6 gap-2 px-2 py-1 text-xs font-medium text-slate-400 border-b border-slate-700">
                          <div className="col-span-2">Lesson</div>
                          <div>Type</div>
                          <div>Status</div>
                          <div>Time Spent</div>
                          <div>Min Required</div>
                        </div>
                        {course.lessons.map((lesson) => (
                          <div
                            key={lesson.lesson_id}
                            className={`grid grid-cols-6 gap-2 px-2 py-2 text-sm rounded ${
                              lesson.is_time_validated ? 'bg-green-900/20' : ''
                            }`}
                          >
                            <div className="col-span-2 text-white truncate">{lesson.lesson_title}</div>
                            <div className="text-slate-400 capitalize">{lesson.content_type}</div>
                            <div>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  lesson.status === 'completed'
                                    ? 'border-green-500 text-green-400'
                                    : lesson.status === 'in_progress'
                                    ? 'border-blue-500 text-blue-400'
                                    : 'border-slate-600 text-slate-400'
                                }`}
                              >
                                {lesson.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className={lesson.is_time_validated ? 'text-green-400' : 'text-yellow-400'}>
                              {formatDuration(lesson.time_spent_seconds)}
                            </div>
                            <div className="text-slate-500">
                              {formatDuration(lesson.min_required_seconds)}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end gap-4 pt-2 text-sm">
                          <span className="text-slate-400">
                            Total Time: <span className="text-white">{formatDuration(course.total_time_spent_seconds)}</span>
                          </span>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-slate-400 text-center py-8">No courses enrolled</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'quizzes' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Quiz Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            {quizAttempts.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-4 px-4 py-2 text-xs font-medium text-slate-400 border-b border-slate-700">
                  <div className="col-span-2">Quiz</div>
                  <div>Course</div>
                  <div>Date</div>
                  <div>Score</div>
                  <div>Status</div>
                  <div>Time</div>
                </div>
                {quizAttempts.map((attempt) => (
                  <div key={attempt.attempt_id} className="grid grid-cols-7 gap-4 px-4 py-3 rounded hover:bg-slate-700/30">
                    <div className="col-span-2 text-white truncate">{attempt.quiz_title}</div>
                    <div className="text-slate-400 truncate">{attempt.course_title}</div>
                    <div className="text-slate-400 text-sm">
                      {new Date(attempt.submitted_at || attempt.started_at).toLocaleDateString()}
                    </div>
                    <div>
                      {attempt.score !== null ? (
                        <span className={attempt.passed ? 'text-green-400' : 'text-red-400'}>
                          {Math.round(attempt.score)}%
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </div>
                    <div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          attempt.status === 'completed'
                            ? attempt.passed
                              ? 'border-green-500 text-green-400'
                              : 'border-red-500 text-red-400'
                            : 'border-yellow-500 text-yellow-400'
                        }`}
                      >
                        {attempt.status === 'completed'
                          ? attempt.passed
                            ? 'Passed'
                            : 'Failed'
                          : 'In Progress'}
                      </Badge>
                    </div>
                    <div className="text-slate-400 text-sm">
                      {formatDuration(attempt.time_spent_seconds)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">No quiz attempts</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'logins' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Login History</CardTitle>
          </CardHeader>
          <CardContent>
            {loginHistory.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-4 px-4 py-2 text-xs font-medium text-slate-400 border-b border-slate-700">
                  <div>Login Time</div>
                  <div>Logout Time</div>
                  <div>Duration</div>
                  <div>IP Address</div>
                  <div>Browser</div>
                </div>
                {loginHistory.map((login) => (
                  <div key={login.id} className="grid grid-cols-5 gap-4 px-4 py-3 rounded hover:bg-slate-700/30">
                    <div className="text-white text-sm">{formatDate(login.logged_in_at)}</div>
                    <div className="text-slate-400 text-sm">
                      {login.logged_out_at ? formatDate(login.logged_out_at) : 'Active'}
                    </div>
                    <div className="text-slate-400 text-sm">
                      {formatDuration(login.session_duration_seconds)}
                    </div>
                    <div className="text-slate-500 text-sm">{login.ip_address || '-'}</div>
                    <div className="text-slate-500 text-sm">{parseBrowser(login.user_agent)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">No login history</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
