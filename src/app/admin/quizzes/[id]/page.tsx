'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  correct_answer: number[];
  points: number;
  sort_order: number;
}

interface Quiz {
  id: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  title: string;
  description: string | null;
  time_limit_minutes: number;
  passing_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Stats {
  totalAttempts: number;
  passedCount: number;
  averageScore: string | null;
}

export default function AdminQuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    time_limit_minutes: 45,
    passing_score: 70
  });

  useEffect(() => {
    fetchQuiz();
  }, [resolvedParams.id]);

  async function fetchQuiz() {
    try {
      const res = await fetch(`/api/admin/quizzes/${resolvedParams.id}`);
      if (!res.ok) {
        router.push('/admin/quizzes');
        return;
      }
      const data = await res.json();
      setQuiz(data.quiz);
      setQuestions(data.questions.map((q: Question) => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        correct_answer: typeof q.correct_answer === 'string' ? JSON.parse(q.correct_answer) : q.correct_answer
      })));
      setStats(data.stats);
      setEditForm({
        title: data.quiz.title,
        description: data.quiz.description || '',
        time_limit_minutes: data.quiz.time_limit_minutes,
        passing_score: data.quiz.passing_score
      });
    } catch (error) {
      console.error('Failed to fetch quiz:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateQuestions() {
    setGenerating(true);
    setGenerateDialogOpen(false);
    try {
      const res = await fetch(`/api/admin/quizzes/${resolvedParams.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 20 })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchQuiz();
      } else {
        alert(data.error || 'Failed to generate questions');
      }
    } catch (error) {
      console.error('Failed to generate questions:', error);
      alert('Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  }

  async function handleTogglePublish() {
    if (!quiz) return;

    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/quizzes/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !quiz.is_active })
      });

      if (res.ok) {
        fetchQuiz();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update quiz');
      }
    } catch (error) {
      console.error('Failed to update quiz:', error);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveEdit() {
    try {
      const res = await fetch(`/api/admin/quizzes/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        setEditDialogOpen(false);
        fetchQuiz();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update quiz');
      }
    } catch (error) {
      console.error('Failed to update quiz:', error);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/admin/quizzes/${resolvedParams.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        router.push('/admin/quizzes');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete quiz');
      }
    } catch (error) {
      console.error('Failed to delete quiz:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading quiz...</div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/quizzes" className="text-sm text-muted-foreground hover:underline">
            &larr; Back to Quizzes
          </Link>
          <h1 className="text-3xl font-bold mt-2">{quiz.title}</h1>
          <p className="text-muted-foreground">{quiz.course_title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={quiz.is_active ? 'default' : 'secondary'} className="text-sm">
            {quiz.is_active ? 'Published' : 'Draft'}
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Questions</CardDescription>
            <CardTitle className="text-2xl">{questions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Attempts</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalAttempts || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pass Rate</CardDescription>
            <CardTitle className="text-2xl">
              {stats?.totalAttempts
                ? `${Math.round((stats.passedCount / stats.totalAttempts) * 100)}%`
                : '-'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Score</CardDescription>
            <CardTitle className="text-2xl">
              {stats?.averageScore ? `${stats.averageScore}%` : '-'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quiz Settings</CardTitle>
          <CardDescription>
            Time limit: {quiz.time_limit_minutes} min | Passing score: {quiz.passing_score}%
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              Edit Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => setGenerateDialogOpen(true)}
              disabled={generating || quiz.is_active}
            >
              {generating ? 'Generating...' : 'Generate Questions (AI)'}
            </Button>
            <Button
              onClick={handleTogglePublish}
              disabled={publishing || (questions.length === 0 && !quiz.is_active)}
              variant={quiz.is_active ? 'destructive' : 'default'}
            >
              {publishing ? 'Updating...' : quiz.is_active ? 'Unpublish' : 'Publish Quiz'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(true)}
              className="text-destructive"
              disabled={Number(stats?.totalAttempts || 0) > 0}
            >
              Delete Quiz
            </Button>
          </div>
          {quiz.is_active && (
            <p className="text-sm text-muted-foreground mt-2">
              Quiz is published. Deactivate to edit questions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle>Questions ({questions.length})</CardTitle>
          <CardDescription>
            {questions.length === 0
              ? 'No questions yet. Use AI to generate questions from course content.'
              : 'Review and manage quiz questions'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                Generate 20 questions automatically from the course content
              </p>
              <Button onClick={() => setGenerateDialogOpen(true)} disabled={generating}>
                {generating ? 'Generating Questions...' : 'Generate Questions with AI'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">Q{idx + 1}</span>
                      <Badge variant="outline" className="text-xs">
                        {q.question_type === 'multiple' ? 'Multiple answers' : 'Single answer'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{q.points} pts</span>
                    </div>
                  </div>
                  <p className="font-medium mb-3">{q.question}</p>
                  <div className="grid gap-2">
                    {q.options.map((opt, optIdx) => (
                      <div
                        key={optIdx}
                        className={`px-3 py-2 rounded text-sm ${
                          q.correct_answer.includes(optIdx)
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                            : 'bg-muted'
                        }`}
                      >
                        <span className="font-medium mr-2">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        {opt}
                        {q.correct_answer.includes(optIdx) && (
                          <span className="ml-2 text-green-600 dark:text-green-400 text-xs">
                            (Correct)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Quiz Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time">Time Limit (minutes)</Label>
                <Input
                  id="time"
                  type="number"
                  value={editForm.time_limit_minutes}
                  onChange={e => setEditForm({ ...editForm, time_limit_minutes: parseInt(e.target.value) || 45 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passing">Passing Score (%)</Label>
                <Input
                  id="passing"
                  type="number"
                  value={editForm.passing_score}
                  onChange={e => setEditForm({ ...editForm, passing_score: parseInt(e.target.value) || 70 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Confirm Dialog */}
      <AlertDialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Questions with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              This will use Claude AI to generate 20 questions from the course content.
              {questions.length > 0 && (
                <strong className="block mt-2 text-destructive">
                  Warning: This will replace all existing questions!
                </strong>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateQuestions}>
              Generate Questions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this quiz and all its questions.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete Quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
