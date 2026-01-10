'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Question {
  id: string;
  question: string;
  question_type: string;
  options: string[];
  points: number;
  sort_order: number;
}

interface QuizInfo {
  id: string;
  title: string;
  description: string | null;
  time_limit_minutes: number;
  passing_score: number;
  course_title: string;
  course_slug: string;
  questionCount: number;
}

interface Attempt {
  id: string;
  started_at: string;
  integrityWarnings: number;
}

interface Result {
  score: number;
  passed: boolean;
  passingScore: number;
  timeSpentSeconds: number;
  totalQuestions: number;
  correctAnswers: number;
  autoSubmitted?: boolean;
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');

  useEffect(() => {
    fetchQuiz();
  }, [resolvedParams.id]);

  // Timer effect
  useEffect(() => {
    if (phase !== 'quiz' || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  // Focus detection effect
  useEffect(() => {
    if (phase !== 'quiz') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportIntegrityWarning('tab_hidden');
      }
    };

    const handleBlur = () => {
      reportIntegrityWarning('window_blur');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [phase, attempt]);

  async function fetchQuiz() {
    try {
      const res = await fetch(`/api/quizzes/${resolvedParams.id}`);
      if (!res.ok) {
        router.push('/courses');
        return;
      }
      const data = await res.json();
      setQuiz(data.quiz);

      if (data.existingAttempt) {
        setAttempt(data.existingAttempt);
        setWarningCount(data.existingAttempt.integrityWarnings);
      }
    } catch (error) {
      console.error('Failed to fetch quiz:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch(`/api/quizzes/${resolvedParams.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to start quiz');
        return;
      }

      const data = await res.json();
      setAttempt(data.attempt);
      setQuestions(data.questions);
      setTimeLeft(data.timeLimit * 60);
      setPhase('quiz');
    } catch (error) {
      console.error('Failed to start quiz:', error);
    } finally {
      setStarting(false);
    }
  }

  async function reportIntegrityWarning(type: string) {
    if (!attempt) return;

    try {
      const res = await fetch(`/api/quizzes/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'integrity_warning',
          attemptId: attempt.id,
          integrityFlag: type,
          answers
        })
      });

      const data = await res.json();
      if (data.warnings) {
        setWarningCount(data.warnings);
        if (data.warnings < 2) {
          setWarningDialogOpen(true);
        }
      }

      if (data.submitted) {
        setResult(data);
        setPhase('result');
      }
    } catch (error) {
      console.error('Failed to report integrity warning:', error);
    }
  }

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (!attempt || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/quizzes/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          attemptId: attempt.id,
          answers
        })
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ ...data, autoSubmitted: isAutoSubmit });
        setPhase('result');
      } else {
        alert(data.error || 'Failed to submit quiz');
      }
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    } finally {
      setSubmitting(false);
    }
  }, [attempt, answers, submitting, resolvedParams.id]);

  function handleAnswerSelect(questionId: string, optionIndex: number, isMultiple: boolean) {
    setAnswers(prev => {
      const current = prev[questionId] || [];
      if (isMultiple) {
        if (current.includes(optionIndex)) {
          return { ...prev, [questionId]: current.filter(i => i !== optionIndex) };
        }
        return { ...prev, [questionId]: [...current, optionIndex] };
      }
      return { ...prev, [questionId]: [optionIndex] };
    });
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading quiz...</div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  // Intro phase
  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{quiz.title}</CardTitle>
            <CardDescription>{quiz.course_title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {quiz.description && (
              <p className="text-muted-foreground">{quiz.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">{quiz.questionCount}</div>
                <div className="text-muted-foreground">Questions</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">{quiz.time_limit_minutes} min</div>
                <div className="text-muted-foreground">Time Limit</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">{quiz.passing_score}%</div>
                <div className="text-muted-foreground">Passing Score</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">100</div>
                <div className="text-muted-foreground">Total Points</div>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Important:</p>
              <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-300 space-y-1">
                <li>Do not leave this tab during the quiz</li>
                <li>First warning: Alert message</li>
                <li>Second warning: Quiz auto-submits</li>
                <li>Timer starts when you begin</li>
              </ul>
            </div>

            <Button
              onClick={handleStart}
              disabled={starting}
              className="w-full"
              size="lg"
            >
              {starting ? 'Starting...' : 'Start Quiz'}
            </Button>

            <Link href={`/courses/${quiz.course_slug}`}>
              <Button variant="ghost" className="w-full">
                Back to Course
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Result phase
  if (phase === 'result' && result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className={`text-6xl mb-4 ${result.passed ? 'text-green-500' : 'text-red-500'}`}>
              {result.passed ? '🎉' : '😔'}
            </div>
            <CardTitle className="text-2xl">
              {result.passed ? 'Congratulations!' : 'Quiz Not Passed'}
            </CardTitle>
            <CardDescription>
              {result.autoSubmitted && (
                <Badge variant="destructive" className="mb-2">Auto-submitted</Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="text-5xl font-bold mb-2">
                {Math.round(result.score)}%
              </div>
              <div className="text-muted-foreground">
                Passing score: {result.passingScore}%
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">{result.correctAnswers}/{result.totalQuestions}</div>
                <div className="text-muted-foreground">Correct Answers</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="font-medium">
                  {Math.floor(result.timeSpentSeconds / 60)}:{(result.timeSpentSeconds % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-muted-foreground">Time Taken</div>
              </div>
            </div>

            <div className="space-y-2">
              <Link href={`/courses/${quiz.course_slug}`}>
                <Button className="w-full">Back to Course</Button>
              </Link>
              {!result.passed && (
                <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz phase
  const question = questions[currentQuestion];
  const answeredCount = Object.keys(answers).length;
  const progress = ((currentQuestion + 1) / questions.length) * 100;
  const isTimeWarning = timeLeft < 300; // Less than 5 minutes

  return (
    <div className="min-h-screen bg-background">
      {/* Header with timer */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="container max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Question {currentQuestion + 1} of {questions.length}
            </div>
            <div className={`text-lg font-mono font-bold ${isTimeWarning ? 'text-red-500 animate-pulse' : ''}`}>
              {formatTime(timeLeft)}
            </div>
          </div>
          <Progress value={progress} className="mt-2" />
        </div>
      </div>

      {/* Question */}
      <div className="container max-w-3xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">
                {question.question_type === 'multiple' ? 'Select all that apply' : 'Select one'}
              </Badge>
              <span className="text-sm text-muted-foreground">{question.points} points</span>
            </div>
            <CardTitle className="text-xl leading-relaxed">{question.question}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {question.options.map((option, idx) => {
                const isSelected = (answers[question.id] || []).includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswerSelect(question.id, idx, question.question_type === 'multiple')}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                      }`}>
                        {isSelected && (question.question_type === 'multiple' ? '✓' : '●')}
                      </div>
                      <span>{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestion(prev => prev - 1)}
            disabled={currentQuestion === 0}
          >
            Previous
          </Button>

          <div className="text-sm text-muted-foreground">
            {answeredCount} of {questions.length} answered
          </div>

          {currentQuestion === questions.length - 1 ? (
            <Button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentQuestion(prev => prev + 1)}
            >
              Next
            </Button>
          )}
        </div>

        {/* Question navigator */}
        <div className="mt-8 p-4 bg-muted rounded-lg">
          <div className="text-sm text-muted-foreground mb-3">Jump to question:</div>
          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const isAnswered = !!answers[q.id];
              const isCurrent = idx === currentQuestion;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(idx)}
                  className={`w-8 h-8 rounded text-sm font-medium ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : isAnswered
                        ? 'bg-green-500 text-white'
                        : 'bg-background border'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Warning Dialog */}
      <AlertDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-yellow-600">Warning!</AlertDialogTitle>
            <AlertDialogDescription>
              You left the quiz page. This is your {warningCount === 1 ? 'first' : 'second'} warning.
              <br /><br />
              <strong>If you leave again, your quiz will be automatically submitted.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>I Understand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
