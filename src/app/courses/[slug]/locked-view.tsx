'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PrerequisiteStatus } from '@/lib/types';

interface LockedCourseViewProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    category_name: string | null;
  };
  prerequisites: PrerequisiteStatus[];
}

export function LockedCourseView({ course, prerequisites }: LockedCourseViewProps) {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/courses" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Courses
          </Link>

          <div className="flex items-start gap-6">
            {/* Course Thumbnail with Lock Overlay */}
            <div className="relative w-48 h-32 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-slate-700 to-slate-800">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="w-full h-full object-cover opacity-50"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-50">
                  <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {/* Lock Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                <div className="w-14 h-14 rounded-full bg-amber-600/20 flex items-center justify-center border-2 border-amber-500/50">
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {course.category_name && (
                  <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                    {course.category_name}
                  </Badge>
                )}
                <Badge className="bg-amber-600/20 text-amber-400 border border-amber-600/50">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Locked
                </Badge>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">{course.title}</h1>
              {course.description && (
                <p className="text-slate-400">{course.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Prerequisites Required */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Prerequisites Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 mb-6">
              Complete the following courses to unlock this content. Each course requires completing all lessons and passing the quiz.
            </p>

            <div className="space-y-4">
              {prerequisites.map((prereq) => (
                <div
                  key={prereq.course_id}
                  className={`p-4 rounded-lg border ${
                    prereq.is_completed
                      ? 'bg-green-900/20 border-green-700/50'
                      : 'bg-slate-700/30 border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {prereq.is_completed ? (
                          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="9" strokeWidth={2} />
                          </svg>
                        )}
                        <h3 className="text-white font-medium">{prereq.title}</h3>
                        {prereq.is_completed && (
                          <Badge className="bg-green-600 text-xs">Completed</Badge>
                        )}
                      </div>

                      {/* Progress Details */}
                      <div className="ml-7 mt-2 space-y-2">
                        {/* Lessons Progress */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-400 w-24">Lessons:</span>
                          <div className="flex-1 max-w-xs">
                            <Progress
                              value={prereq.total_lessons > 0 ? (prereq.lessons_completed / prereq.total_lessons) * 100 : 0}
                              className="h-2"
                            />
                          </div>
                          <span className="text-sm text-slate-300">
                            {prereq.lessons_completed} / {prereq.total_lessons}
                          </span>
                          {prereq.lessons_completed >= prereq.total_lessons && prereq.total_lessons > 0 && (
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* Quiz Status */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-400 w-24">Quiz:</span>
                          {prereq.quiz_exists ? (
                            <>
                              <span className={`text-sm ${prereq.quiz_passed ? 'text-green-400' : 'text-slate-300'}`}>
                                {prereq.quiz_passed ? 'Passed' : 'Not passed'}
                              </span>
                              {prereq.quiz_passed && (
                                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-slate-500">No quiz required</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!prereq.is_completed && (
                      <Link href={`/courses/${prereq.slug}`}>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                          Continue
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  {prerequisites.filter(p => p.is_completed).length} of {prerequisites.length} prerequisites completed
                </span>
                {prerequisites.every(p => p.is_completed) ? (
                  <Badge className="bg-green-600">Ready to Access</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-600/50 text-amber-400">
                    {prerequisites.filter(p => !p.is_completed).length} remaining
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Motivational Message */}
        <div className="mt-6 text-center">
          <p className="text-slate-400">
            Complete the prerequisite courses to build the foundation you need for this advanced content.
          </p>
          <Link href="/courses">
            <Button variant="outline" className="mt-4 border-slate-600 text-slate-300 hover:bg-slate-700">
              Browse All Courses
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
