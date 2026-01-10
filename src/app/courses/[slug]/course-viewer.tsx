'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { Course, Lesson, LessonAttachment, LessonProgress } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Sanitize HTML to prevent XSS attacks
function sanitizeHtml(html: string | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'code', 'pre', 'blockquote', 'img', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel', 'title'],
    ALLOW_DATA_ATTR: false,
  });
}


interface LessonWithDetails extends Omit<Lesson, 'progress' | 'attachments'> {
  attachments: LessonAttachment[];
  progress: LessonProgress | null;
}

interface CourseWithDetails extends Course {
  category_name: string | null;
}

interface QuizInfo {
  id: string;
  title: string;
  question_count: number;
  time_limit_minutes: number;
  passing_score: number;
  best_score: number | null;
  passed: boolean;
}

interface CourseViewerProps {
  course: CourseWithDetails;
  lessons: LessonWithDetails[];
  currentLessonIndex: number;
  userId: string;
  quizInfo: QuizInfo | null;
}

export function CourseViewer({ course, lessons, currentLessonIndex: initialIndex, quizInfo }: CourseViewerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const currentLesson = lessons[currentIndex];
  const completedCount = lessons.filter(l => l.progress?.status === 'completed').length;
  const overallProgress = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  const goToLesson = (index: number) => {
    setCurrentIndex(index);
    router.push(`/courses/${course.slug}?lesson=${index + 1}`, { scroll: false });
    // Mark as in progress
    markProgress(lessons[index].id, 'in_progress', 0);
  };

  const goNext = () => {
    if (currentIndex < lessons.length - 1) {
      goToLesson(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      goToLesson(currentIndex - 1);
    }
  };

  const markComplete = async () => {
    await markProgress(currentLesson.id, 'completed', 100);
    // Auto-advance to next lesson
    if (currentIndex < lessons.length - 1) {
      goToLesson(currentIndex + 1);
    }
  };

  const markProgress = async (lessonId: string, status: string, progressPercent: number) => {
    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          courseId: course.id,
          status,
          progressPercent,
        }),
      });
      router.refresh();
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  };

  // Extract Vimeo video ID and hash from URL (handles private videos)
  const getVimeoEmbedUrl = (url: string | null) => {
    if (!url) return null;
    // Match URLs like: https://vimeo.com/1150452123/57aa08bfe4
    const matchWithHash = url.match(/(?:vimeo\.com\/)(\d+)\/([a-zA-Z0-9]+)/);
    if (matchWithHash) {
      return `https://player.vimeo.com/video/${matchWithHash[1]}?h=${matchWithHash[2]}&autoplay=0&title=0&byline=0&portrait=0`;
    }
    // Match URLs like: https://vimeo.com/1150452123
    const match = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (match) {
      return `https://player.vimeo.com/video/${match[1]}?autoplay=0&title=0&byline=0&portrait=0`;
    }
    return url;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col border-r border-slate-700 bg-slate-800/50 transition-all duration-300",
        sidebarOpen ? "w-80" : "w-0 overflow-hidden"
      )}>
        <div className="p-4 border-b border-slate-700">
          <Link href="/courses" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Courses
          </Link>
          <h2 className="font-semibold text-white line-clamp-2">{course.title}</h2>
          {course.category_name && (
            <Badge variant="outline" className="mt-2 text-xs border-slate-600 text-slate-400">
              {course.category_name}
            </Badge>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-sm text-slate-400 mb-1">
              <span>Progress</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {lessons.map((lesson, index) => {
              const isActive = index === currentIndex;
              const isCompleted = lesson.progress?.status === 'completed';
              const isInProgress = lesson.progress?.status === 'in_progress';

              return (
                <button
                  key={lesson.id}
                  onClick={() => goToLesson(index)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg mb-1 transition-colors flex items-start gap-3",
                    isActive
                      ? "bg-blue-600/20 border border-blue-500/50"
                      : "hover:bg-slate-700/50"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5",
                    isCompleted
                      ? "bg-green-600 text-white"
                      : isInProgress
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-400"
                  )}>
                    {isCompleted ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium line-clamp-2",
                      isActive ? "text-white" : "text-slate-300"
                    )}>
                      {lesson.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      {lesson.content_type === 'video' && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                          Video
                        </span>
                      )}
                      {lesson.content_type === 'text' && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          Reading
                        </span>
                      )}
                      {lesson.content_type === 'mixed' && (
                        <span>Video + Reading</span>
                      )}
                      {lesson.duration_minutes > 0 && (
                        <span>{lesson.duration_minutes} min</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Quiz Section */}
            {quizInfo && (
              <div className="mt-4 mx-2 p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold text-white">Course Quiz</span>
                </div>
                <p className="text-sm text-slate-400 mb-3">
                  {quizInfo.question_count} questions • {quizInfo.time_limit_minutes} min • {quizInfo.passing_score}% to pass
                </p>
                {quizInfo.best_score !== null && (
                  <div className={cn(
                    "text-sm mb-3 flex items-center gap-2",
                    quizInfo.passed ? "text-green-400" : "text-amber-400"
                  )}>
                    {quizInfo.passed ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Passed with {Math.round(quizInfo.best_score)}%
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Best: {Math.round(quizInfo.best_score)}%
                      </>
                    )}
                  </div>
                )}
                <Link
                  href={`/quiz/${quizInfo.id}`}
                  className={cn(
                    "block w-full text-center py-2 px-4 rounded-lg font-medium transition-colors",
                    quizInfo.passed
                      ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  )}
                >
                  {quizInfo.passed ? "Retake Quiz" : quizInfo.best_score !== null ? "Try Again" : "Take Quiz"}
                </Link>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-slate-700 bg-slate-800/30">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
            <span className="text-sm text-slate-400">
              Lesson {currentIndex + 1} of {lessons.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={currentIndex === lessons.length - 1}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Next
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 pb-20">
            <h1 className="text-2xl font-bold text-white mb-6">{currentLesson.title}</h1>

            {/* Video Player */}
            {(currentLesson.content_type === 'video' || currentLesson.content_type === 'mixed') && currentLesson.video_url && (
              <div className="mb-6">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <iframe
                    src={getVimeoEmbedUrl(currentLesson.video_url) || ''}
                    className="w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* Text Content - Magazine Layout */}
            {(currentLesson.content_type === 'text' || currentLesson.content_type === 'mixed') && currentLesson.text_content && (
              <div
                className="mb-6 lesson-content text-slate-300 leading-relaxed
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:p-4 [&_h2]:bg-gradient-to-r [&_h2]:from-blue-600/20 [&_h2]:to-purple-600/20 [&_h2]:rounded-xl [&_h2]:border [&_h2]:border-blue-500/20
                  [&_h2:first-child]:mt-0
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-blue-400 [&_h3]:mt-6 [&_h3]:mb-3
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-emerald-400 [&_h4]:mt-4 [&_h4]:mb-2
                  [&_p]:mb-4 [&_p]:leading-relaxed
                  [&_strong]:text-white [&_strong]:font-semibold
                  [&_ul]:my-4 [&_ul]:ml-4 [&_ul]:space-y-2 [&_ul]:list-disc
                  [&_ol]:my-4 [&_ol]:ml-4 [&_ol]:space-y-2 [&_ol]:list-decimal
                  [&_li]:pl-2
                  [&_a]:text-blue-400 [&_a]:underline [&_a]:hover:text-blue-300

                  [&_.lead]:text-lg [&_.lead]:text-slate-200 [&_.lead]:leading-relaxed [&_.lead]:mb-6 [&_.lead]:font-light [&_.lead]:border-l-4 [&_.lead]:border-blue-500 [&_.lead]:pl-4

                  [&_.two-column]:grid [&_.two-column]:grid-cols-1 [&_.two-column]:md:grid-cols-2 [&_.two-column]:gap-6 [&_.two-column]:my-6
                  [&_.three-column]:grid [&_.three-column]:grid-cols-1 [&_.three-column]:md:grid-cols-3 [&_.three-column]:gap-4 [&_.three-column]:my-6

                  [&_.callout]:p-4 [&_.callout]:rounded-lg [&_.callout]:my-6 [&_.callout]:border-l-4
                  [&_.callout-info]:bg-blue-900/30 [&_.callout-info]:border-blue-500
                  [&_.callout-tip]:bg-emerald-900/30 [&_.callout-tip]:border-emerald-500
                  [&_.callout-warning]:bg-amber-900/30 [&_.callout-warning]:border-amber-500
                  [&_.callout-note]:bg-purple-900/30 [&_.callout-note]:border-purple-500
                  [&_.callout-title]:font-semibold [&_.callout-title]:text-white [&_.callout-title]:mb-2 [&_.callout-title]:flex [&_.callout-title]:items-center [&_.callout-title]:gap-2

                  [&_.key-concept]:bg-gradient-to-br [&_.key-concept]:from-slate-800 [&_.key-concept]:to-slate-800/50 [&_.key-concept]:p-5 [&_.key-concept]:rounded-xl [&_.key-concept]:border [&_.key-concept]:border-slate-600 [&_.key-concept]:my-6
                  [&_.key-concept-title]:text-emerald-400 [&_.key-concept-title]:font-bold [&_.key-concept-title]:text-sm [&_.key-concept-title]:uppercase [&_.key-concept-title]:tracking-wider [&_.key-concept-title]:mb-3

                  [&_.pull-quote]:text-xl [&_.pull-quote]:italic [&_.pull-quote]:text-slate-200 [&_.pull-quote]:border-l-4 [&_.pull-quote]:border-purple-500 [&_.pull-quote]:pl-6 [&_.pull-quote]:my-8 [&_.pull-quote]:py-2

                  [&_.code-block]:bg-slate-950 [&_.code-block]:rounded-lg [&_.code-block]:p-4 [&_.code-block]:my-4 [&_.code-block]:font-mono [&_.code-block]:text-sm [&_.code-block]:overflow-x-auto [&_.code-block]:border [&_.code-block]:border-slate-700
                  [&_.code-label]:text-xs [&_.code-label]:text-slate-500 [&_.code-label]:uppercase [&_.code-label]:tracking-wider [&_.code-label]:mb-2
                  [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-amber-400 [&_code]:text-sm [&_code]:font-mono

                  [&_.figure]:my-8 [&_.figure]:text-center
                  [&_.figure_img]:rounded-lg [&_.figure_img]:border [&_.figure_img]:border-slate-600 [&_.figure_img]:shadow-xl [&_.figure_img]:mx-auto [&_.figure_img]:max-w-full
                  [&_.figure-caption]:text-sm [&_.figure-caption]:text-slate-400 [&_.figure-caption]:mt-3 [&_.figure-caption]:italic

                  [&_.highlight-box]:bg-gradient-to-r [&_.highlight-box]:from-blue-600/10 [&_.highlight-box]:to-purple-600/10 [&_.highlight-box]:p-5 [&_.highlight-box]:rounded-xl [&_.highlight-box]:border [&_.highlight-box]:border-blue-500/30 [&_.highlight-box]:my-6

                  [&_.feature-grid]:grid [&_.feature-grid]:grid-cols-2 [&_.feature-grid]:md:grid-cols-4 [&_.feature-grid]:gap-3 [&_.feature-grid]:my-6
                  [&_.feature-item]:bg-slate-800/50 [&_.feature-item]:p-3 [&_.feature-item]:rounded-lg [&_.feature-item]:text-center [&_.feature-item]:border [&_.feature-item]:border-slate-700
                  [&_.feature-icon]:text-2xl [&_.feature-icon]:mb-1
                  [&_.feature-label]:text-xs [&_.feature-label]:text-slate-400

                  [&_.divider]:border-t [&_.divider]:border-slate-700 [&_.divider]:my-8

                  [&_.badge]:inline-flex [&_.badge]:items-center [&_.badge]:px-2.5 [&_.badge]:py-0.5 [&_.badge]:rounded-full [&_.badge]:text-xs [&_.badge]:font-medium
                  [&_.badge-blue]:bg-blue-900/50 [&_.badge-blue]:text-blue-300
                  [&_.badge-green]:bg-emerald-900/50 [&_.badge-green]:text-emerald-300
                  [&_.badge-purple]:bg-purple-900/50 [&_.badge-purple]:text-purple-300"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentLesson.text_content) }}
              />
            )}

            {/* Description - Magazine Layout */}
            {currentLesson.description && (
              <div
                className="mb-6 lesson-content text-slate-300 leading-relaxed
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:p-4 [&_h2]:bg-gradient-to-r [&_h2]:from-blue-600/20 [&_h2]:to-purple-600/20 [&_h2]:rounded-xl [&_h2]:border [&_h2]:border-blue-500/20
                  [&_h2:first-child]:mt-0
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-blue-400 [&_h3]:mt-6 [&_h3]:mb-3
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-emerald-400 [&_h4]:mt-4 [&_h4]:mb-2
                  [&_p]:mb-4 [&_p]:leading-relaxed
                  [&_strong]:text-white [&_strong]:font-semibold
                  [&_ul]:my-4 [&_ul]:ml-4 [&_ul]:space-y-2 [&_ul]:list-disc
                  [&_ol]:my-4 [&_ol]:ml-4 [&_ol]:space-y-2 [&_ol]:list-decimal
                  [&_li]:pl-2
                  [&_a]:text-blue-400 [&_a]:underline [&_a]:hover:text-blue-300

                  [&_.lead]:text-lg [&_.lead]:text-slate-200 [&_.lead]:leading-relaxed [&_.lead]:mb-6 [&_.lead]:font-light [&_.lead]:border-l-4 [&_.lead]:border-blue-500 [&_.lead]:pl-4

                  [&_.two-column]:grid [&_.two-column]:grid-cols-1 [&_.two-column]:md:grid-cols-2 [&_.two-column]:gap-6 [&_.two-column]:my-6

                  [&_.callout]:p-4 [&_.callout]:rounded-lg [&_.callout]:my-6 [&_.callout]:border-l-4
                  [&_.callout-info]:bg-blue-900/30 [&_.callout-info]:border-blue-500
                  [&_.callout-tip]:bg-emerald-900/30 [&_.callout-tip]:border-emerald-500
                  [&_.callout-warning]:bg-amber-900/30 [&_.callout-warning]:border-amber-500
                  [&_.callout-title]:font-semibold [&_.callout-title]:text-white [&_.callout-title]:mb-2

                  [&_.key-concept]:bg-gradient-to-br [&_.key-concept]:from-slate-800 [&_.key-concept]:to-slate-800/50 [&_.key-concept]:p-5 [&_.key-concept]:rounded-xl [&_.key-concept]:border [&_.key-concept]:border-slate-600 [&_.key-concept]:my-6
                  [&_.key-concept-title]:text-emerald-400 [&_.key-concept-title]:font-bold [&_.key-concept-title]:text-sm [&_.key-concept-title]:uppercase [&_.key-concept-title]:tracking-wider [&_.key-concept-title]:mb-3

                  [&_.code-block]:bg-slate-950 [&_.code-block]:rounded-lg [&_.code-block]:p-4 [&_.code-block]:my-4 [&_.code-block]:font-mono [&_.code-block]:text-sm [&_.code-block]:overflow-x-auto [&_.code-block]:border [&_.code-block]:border-slate-700
                  [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-amber-400 [&_code]:text-sm [&_code]:font-mono

                  [&_.figure]:my-8 [&_.figure]:text-center
                  [&_.figure_img]:rounded-lg [&_.figure_img]:border [&_.figure_img]:border-slate-600 [&_.figure_img]:shadow-xl [&_.figure_img]:mx-auto [&_.figure_img]:max-w-full
                  [&_.figure-caption]:text-sm [&_.figure-caption]:text-slate-400 [&_.figure-caption]:mt-3 [&_.figure-caption]:italic

                  [&_.highlight-box]:bg-gradient-to-r [&_.highlight-box]:from-blue-600/10 [&_.highlight-box]:to-purple-600/10 [&_.highlight-box]:p-5 [&_.highlight-box]:rounded-xl [&_.highlight-box]:border [&_.highlight-box]:border-blue-500/30 [&_.highlight-box]:my-6"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentLesson.description) }}
              />
            )}

            {/* Attachments */}
            {currentLesson.attachments && currentLesson.attachments.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Downloads</h3>
                <div className="space-y-2">
                  {currentLesson.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{attachment.name}</p>
                        <p className="text-sm text-slate-400">
                          {attachment.file_type} {attachment.file_size && `• ${formatFileSize(attachment.file_size)}`}
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <Separator className="my-6 bg-slate-700" />

            {/* Mark Complete Button */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-400">
                {currentLesson.progress?.status === 'completed' ? (
                  <span className="flex items-center gap-2 text-green-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Completed
                  </span>
                ) : (
                  'Mark this lesson as complete when you\'re done'
                )}
              </div>
              {currentLesson.progress?.status !== 'completed' && (
                <Button onClick={markComplete} className="bg-green-600 hover:bg-green-700">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
