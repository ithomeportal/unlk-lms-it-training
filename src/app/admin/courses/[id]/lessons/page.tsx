'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  content_type: 'video' | 'text' | 'mixed';
  video_url: string | null;
  text_content: string | null;
  duration_minutes: number;
  sort_order: number;
}

interface Course {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
}

export default function LessonsManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    content_type: 'video' as 'video' | 'text' | 'mixed',
    video_url: '',
    text_content: '',
    duration_minutes: 0,
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      const [courseRes, lessonsRes] = await Promise.all([
        fetch(`/api/courses/${courseId}`),
        fetch(`/api/courses/${courseId}/lessons`),
      ]);

      if (courseRes.ok) {
        const data = await courseRes.json();
        setCourse(data.course);
      }

      if (lessonsRes.ok) {
        const data = await lessonsRes.json();
        setLessons(data.lessons || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingLesson ? '/api/lessons' : '/api/lessons';
      const method = editingLesson ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingLesson ? { id: editingLesson.id } : { course_id: courseId }),
          ...form,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save lesson');
        return;
      }

      toast.success(editingLesson ? 'Lesson updated' : 'Lesson created');
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;

    try {
      const res = await fetch(`/api/lessons?id=${lessonId}`, { method: 'DELETE' });

      if (!res.ok) {
        toast.error('Failed to delete lesson');
        return;
      }

      toast.success('Lesson deleted');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const handlePublish = async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !course?.is_published }),
      });

      if (!res.ok) {
        toast.error('Failed to update course');
        return;
      }

      toast.success(course?.is_published ? 'Course unpublished' : 'Course published');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setForm({
      title: lesson.title,
      description: lesson.description || '',
      content_type: lesson.content_type,
      video_url: lesson.video_url || '',
      text_content: lesson.text_content || '',
      duration_minutes: lesson.duration_minutes,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingLesson(null);
    setForm({
      title: '',
      description: '',
      content_type: 'video',
      video_url: '',
      text_content: '',
      duration_minutes: 0,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Course not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/courses" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Courses
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{course.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              {course.is_published ? (
                <Badge className="bg-green-600">Published</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-600 text-slate-400">Draft</Badge>
              )}
              <span className="text-sm text-slate-400">{lessons.length} lessons</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handlePublish}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              {course.is_published ? 'Unpublish' : 'Publish'}
            </Button>
            <Link href={`/courses/${course.slug}`} target="_blank">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                Preview
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingLesson ? 'Edit Lesson' : 'Add New Lesson'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Content Type</Label>
                <select
                  value={form.content_type}
                  onChange={(e) => setForm({ ...form, content_type: e.target.value as 'video' | 'text' | 'mixed' })}
                  className="w-full h-10 rounded-md bg-slate-700/50 border border-slate-600 text-white px-3"
                >
                  <option value="video">Video</option>
                  <option value="text">Text/Reading</option>
                  <option value="mixed">Video + Text</option>
                </select>
              </div>

              {(form.content_type === 'video' || form.content_type === 'mixed') && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Vimeo Video URL</Label>
                  <Input
                    value={form.video_url}
                    onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    placeholder="https://vimeo.com/123456789"
                  />
                </div>
              )}

              {(form.content_type === 'text' || form.content_type === 'mixed') && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Text Content (HTML supported)</Label>
                  <textarea
                    value={form.text_content}
                    onChange={(e) => setForm({ ...form, text_content: e.target.value })}
                    className="w-full h-32 rounded-md bg-slate-700/50 border border-slate-600 text-white p-3"
                    placeholder="Enter lesson content..."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Description</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-20 rounded-md bg-slate-700/50 border border-slate-600 text-white p-3"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-600 text-slate-300">
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingLesson ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lessons.length > 0 ? (
        <div className="space-y-2">
          {lessons.map((lesson, index) => (
            <Card key={lesson.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-300">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">{lesson.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                      <Badge variant="outline" className="text-xs border-slate-600">
                        {lesson.content_type === 'video' ? 'Video' : lesson.content_type === 'text' ? 'Text' : 'Mixed'}
                      </Badge>
                      {lesson.duration_minutes > 0 && (
                        <span>{lesson.duration_minutes} min</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(lesson)}
                      className="text-slate-400 hover:text-white"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(lesson.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400 mb-4">No lessons yet. Add your first lesson!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
