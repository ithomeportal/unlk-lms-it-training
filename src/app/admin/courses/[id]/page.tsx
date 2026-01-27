'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { PrerequisitesEditor } from '@/components/admin/prerequisites-editor';

interface Category {
  id: string;
  name: string;
}

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  is_mandatory: boolean;
  is_published: boolean;
  thumbnail_url: string | null;
}

type TabType = 'details' | 'prerequisites';

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '',
    is_mandatory: false,
    is_published: false,
    thumbnail_url: '',
  });

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      const [courseRes, categoriesRes] = await Promise.all([
        fetch(`/api/courses/${courseId}`),
        fetch('/api/categories'),
      ]);

      if (courseRes.ok) {
        const data = await courseRes.json();
        const c = data.course;
        setCourse(c);
        setForm({
          title: c.title || '',
          description: c.description || '',
          category_id: c.category_id || '',
          is_mandatory: c.is_mandatory || false,
          is_published: c.is_published || false,
          thumbnail_url: c.thumbnail_url || '',
        });
      } else {
        toast.error('Course not found');
        router.push('/admin/courses');
        return;
      }

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to load course:', error);
      toast.error('Failed to load course');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to update course');
        return;
      }

      toast.success('Course updated');
      setCourse(data.course);
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete course');
        return;
      }

      toast.success('Course deleted');
      router.push('/admin/courses');
    } catch {
      toast.error('Network error');
    }
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/courses" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Courses
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Edit Course</h1>
          <div className="flex items-center gap-2">
            <Link href={`/admin/courses/${courseId}/lessons`}>
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                Manage Lessons
              </Button>
            </Link>
            <Link href={`/courses/${course.slug}`} target="_blank">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                Preview
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'details'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab('prerequisites')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'prerequisites'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Prerequisites
        </button>
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-slate-300">Course Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="e.g., Introduction to Analytics"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-slate-300">Description</Label>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-32 rounded-md bg-slate-700/50 border border-slate-600 text-white p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the course..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-slate-300">Category</Label>
                <select
                  id="category"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full h-10 rounded-md bg-slate-700/50 border border-slate-600 text-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="thumbnail" className="text-slate-300">Thumbnail URL</Label>
                <Input
                  id="thumbnail"
                  value={form.thumbnail_url}
                  onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="mandatory"
                    checked={form.is_mandatory}
                    onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-700"
                  />
                  <Label htmlFor="mandatory" className="text-slate-300 cursor-pointer">
                    Mark as mandatory training
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="published"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-700"
                  />
                  <Label htmlFor="published" className="text-slate-300 cursor-pointer">
                    Published
                  </Label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDelete}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  Delete Course
                </Button>
                <div className="flex gap-3">
                  <Link href="/admin/courses">
                    <Button type="button" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                      Cancel
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={saving || !form.title}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Prerequisites Tab */}
      {activeTab === 'prerequisites' && (
        <PrerequisitesEditor courseId={courseId} courseTitle={course.title} />
      )}
    </div>
  );
}
