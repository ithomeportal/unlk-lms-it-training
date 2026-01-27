'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Course {
  id: string;
  title: string;
  slug: string;
}

interface Prerequisite {
  id: string;
  course_id: string;
  title: string;
  slug: string;
}

interface PrerequisitesEditorProps {
  courseId: string;
  courseTitle: string;
}

export function PrerequisitesEditor({ courseId, courseTitle }: PrerequisitesEditorProps) {
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [dependents, setDependents] = useState<Course[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      const [prereqRes, coursesRes] = await Promise.all([
        fetch(`/api/courses/${courseId}/prerequisites`),
        fetch('/api/courses'),
      ]);

      if (prereqRes.ok) {
        const data = await prereqRes.json();
        setPrerequisites(data.prerequisites || []);
        setDependents(data.dependents || []);
      }

      if (coursesRes.ok) {
        const data = await coursesRes.json();
        // Filter out current course and already added prerequisites
        const courses = (data.courses || []).filter((c: Course) => c.id !== courseId);
        setAvailableCourses(courses);
      }
    } catch (error) {
      console.error('Failed to load prerequisites:', error);
      toast.error('Failed to load prerequisites');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedCourseId) return;

    setAdding(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/prerequisites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisite_course_id: selectedCourseId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to add prerequisite');
        return;
      }

      toast.success('Prerequisite added');
      setSelectedCourseId('');
      loadData();
    } catch {
      toast.error('Network error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (prerequisiteId: string) => {
    if (!confirm('Are you sure you want to remove this prerequisite?')) return;

    try {
      const res = await fetch(
        `/api/courses/${courseId}/prerequisites?prerequisite_id=${prerequisiteId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to remove prerequisite');
        return;
      }

      toast.success('Prerequisite removed');
      loadData();
    } catch {
      toast.error('Network error');
    }
  };

  // Filter out courses that are already prerequisites
  const prereqIds = new Set(prerequisites.map(p => p.course_id));
  const selectableCourses = availableCourses.filter(c => !prereqIds.has(c.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Prerequisite Section */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg text-white">Add Prerequisite</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 mb-4">
            Select a course that users must complete before accessing &quot;{courseTitle}&quot;.
            Users will need to complete all lessons and pass the quiz (if one exists) to unlock this course.
          </p>
          <div className="flex gap-3">
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="flex-1 h-10 rounded-md bg-slate-700/50 border border-slate-600 text-white px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a course...</option>
              {selectableCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <Button
              onClick={handleAdd}
              disabled={!selectedCourseId || adding}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {adding ? 'Adding...' : 'Add'}
            </Button>
          </div>
          {selectableCourses.length === 0 && (
            <p className="text-sm text-slate-500 mt-2">
              No additional courses available to add as prerequisites.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current Prerequisites */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg text-white">
            Required Prerequisites ({prerequisites.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {prerequisites.length > 0 ? (
            <div className="space-y-2">
              {prerequisites.map((prereq) => (
                <div
                  key={prereq.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-600"
                >
                  <div>
                    <p className="text-white font-medium">{prereq.title}</p>
                    <p className="text-sm text-slate-400">/courses/{prereq.slug}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(prereq.course_id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">
              No prerequisites set. This course is available to all users.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dependent Courses */}
      {dependents.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Courses That Depend on This
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400 mb-3">
              The following courses require &quot;{courseTitle}&quot; as a prerequisite:
            </p>
            <div className="flex flex-wrap gap-2">
              {dependents.map((course) => (
                <Badge
                  key={course.id}
                  variant="outline"
                  className="border-amber-600/50 text-amber-400 bg-amber-900/20"
                >
                  {course.title}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
