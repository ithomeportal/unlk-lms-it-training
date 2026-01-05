'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Course, Lesson, LessonAttachment, LessonProgress } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Component to beautifully render lesson content
function LessonContent({ content }: { content: string }) {
  const lines = content.split('\n').filter(line => line.trim());

  const elements: React.ReactElement[] = [];
  let currentTopics: { title: string; description: string }[] = [];
  let inTopicsSection = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed === 'Key Topics' || trimmed === 'Key Topics:') {
      inTopicsSection = true;
      return;
    }

    if (trimmed === 'Important Notes' || trimmed === 'Important Notes:' ||
        trimmed === 'Prerequisites' || trimmed === 'Prerequisites:') {
      // Flush any pending topics
      if (currentTopics.length > 0) {
        elements.push(
          <div key={`topics-${index}`} className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Key Topics
            </h3>
            <div className="grid gap-3">
              {currentTopics.map((topic, i) => (
                <Card key={i} className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-white">{topic.title}</p>
                        {topic.description && (
                          <p className="text-sm text-slate-400 mt-1">{topic.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
        currentTopics = [];
      }
      inTopicsSection = false;

      // Add Important Notes or Prerequisites section
      const sectionTitle = trimmed.replace(':', '');
      elements.push(
        <div key={`section-${index}`} className="mb-4 mt-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            {sectionTitle === 'Important Notes' ? (
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
            {sectionTitle}
          </h3>
        </div>
      );
      return;
    }

    // Check if line is a topic (has " - " separator)
    if (inTopicsSection && trimmed.includes(' - ')) {
      const [title, ...descParts] = trimmed.split(' - ');
      currentTopics.push({ title: title.trim(), description: descParts.join(' - ').trim() });
      return;
    }

    // First line is usually the main title
    if (index === 0 && !trimmed.startsWith('-')) {
      elements.push(
        <div key={`title-${index}`} className="mb-4 p-4 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl border border-blue-500/20">
          <h2 className="text-xl font-bold text-white">{trimmed}</h2>
        </div>
      );
      return;
    }

    // Second line is usually a description
    if (index === 1 && elements.length === 1) {
      elements.push(
        <p key={`desc-${index}`} className="text-slate-300 mb-6 text-lg leading-relaxed">{trimmed}</p>
      );
      return;
    }

    // Regular paragraph or note
    if (!inTopicsSection) {
      elements.push(
        <p key={`para-${index}`} className="text-slate-300 mb-3 leading-relaxed">{trimmed}</p>
      );
    }
  });

  // Flush remaining topics if any
  if (currentTopics.length > 0) {
    elements.push(
      <div key="topics-final" className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Key Topics
        </h3>
        <div className="grid gap-3">
          {currentTopics.map((topic, i) => (
            <Card key={i} className="bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-white">{topic.title}</p>
                    {topic.description && (
                      <p className="text-sm text-slate-400 mt-1">{topic.description}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return <div className="mb-6">{elements}</div>;
}

interface LessonWithDetails extends Omit<Lesson, 'progress' | 'attachments'> {
  attachments: LessonAttachment[];
  progress: LessonProgress | null;
}

interface CourseWithDetails extends Course {
  category_name: string | null;
}

interface CourseViewerProps {
  course: CourseWithDetails;
  lessons: LessonWithDetails[];
  currentLessonIndex: number;
  userId: string;
}

export function CourseViewer({ course, lessons, currentLessonIndex: initialIndex, userId }: CourseViewerProps) {
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
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto p-6">
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

            {/* Text Content */}
            {(currentLesson.content_type === 'text' || currentLesson.content_type === 'mixed') && currentLesson.text_content && (
              <LessonContent content={currentLesson.text_content} />
            )}

            {/* Description */}
            {currentLesson.description && (
              <LessonContent content={currentLesson.description} />
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
        </ScrollArea>
      </div>
    </div>
  );
}
