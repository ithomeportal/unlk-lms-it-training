'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
}

export default function NewCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '',
    is_mandatory: false,
    thumbnail_url: '',
  });

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create course');
        return;
      }

      toast.success('Course created successfully');
      router.push(`/admin/courses/${data.course.id}/lessons`);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/courses" className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Courses
        </Link>
        <h1 className="text-2xl font-bold text-white">Create New Course</h1>
      </div>

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

            <div className="flex gap-3">
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={loading || !form.title}
              >
                {loading ? 'Creating...' : 'Create Course'}
              </Button>
              <Link href="/admin/courses">
                <Button type="button" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
