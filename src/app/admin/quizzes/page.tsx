'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  question_count: string;
  attempt_count: string;
  created_at: string;
}

interface Course {
  id: string;
  title: string;
  slug: string;
}

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchQuizzes();
    fetchCourses();
  }, []);

  async function fetchQuizzes() {
    try {
      const res = await fetch('/api/admin/quizzes');
      const data = await res.json();
      setQuizzes(data.quizzes || []);
    } catch (error) {
      console.error('Failed to fetch quizzes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCourses() {
    try {
      const res = await fetch('/api/courses');
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  }

  async function handleCreateQuiz() {
    if (!selectedCourse || !newQuizTitle.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: selectedCourse,
          title: newQuizTitle.trim(),
          time_limit_minutes: 45,
          passing_score: 70
        })
      });

      if (res.ok) {
        setCreateDialogOpen(false);
        setSelectedCourse('');
        setNewQuizTitle('');
        fetchQuizzes();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create quiz');
      }
    } catch (error) {
      console.error('Failed to create quiz:', error);
      alert('Failed to create quiz');
    } finally {
      setCreating(false);
    }
  }

  // Get courses without quizzes
  const coursesWithoutQuizzes = courses.filter(
    c => !quizzes.some(q => q.course_id === c.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading quizzes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quiz Management</h1>
          <p className="text-muted-foreground">
            Create and manage course quizzes with AI-generated questions
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          disabled={coursesWithoutQuizzes.length === 0}
        >
          Create Quiz
        </Button>
      </div>

      {quizzes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No quizzes created yet</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              Create Your First Quiz
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map(quiz => (
            <Card key={quiz.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{quiz.title}</CardTitle>
                    <CardDescription>{quiz.course_title}</CardDescription>
                  </div>
                  <Badge variant={quiz.is_active ? 'default' : 'secondary'}>
                    {quiz.is_active ? 'Active' : 'Draft'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Questions:</span>
                      <span className="ml-2 font-medium">{quiz.question_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Attempts:</span>
                      <span className="ml-2 font-medium">{quiz.attempt_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time:</span>
                      <span className="ml-2 font-medium">{quiz.time_limit_minutes} min</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pass:</span>
                      <span className="ml-2 font-medium">{quiz.passing_score}%</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Link href={`/admin/quizzes/${quiz.id}`}>
                      <Button variant="outline" className="w-full">
                        Manage Quiz
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Quiz</DialogTitle>
            <DialogDescription>
              Create a quiz for a course. You can generate questions using AI after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="course">Course</Label>
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {coursesWithoutQuizzes.map(course => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {coursesWithoutQuizzes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  All courses already have quizzes
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Quiz Title</Label>
              <Input
                id="title"
                value={newQuizTitle}
                onChange={e => setNewQuizTitle(e.target.value)}
                placeholder="e.g., Final Assessment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateQuiz}
              disabled={!selectedCourse || !newQuizTitle.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Quiz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
