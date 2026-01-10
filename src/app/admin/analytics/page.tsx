'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

interface UserAnalytics {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  total_session_time_seconds: number;
  courses_enrolled: number;
  courses_in_progress: number;
  courses_completed: number;
  overall_progress_percent: number;
  total_time_spent_seconds: number;
  quizzes_taken: number;
  quizzes_passed: number;
  average_quiz_score: number | null;
}

interface Summary {
  totalUsers: number;
  activeUsers: number;
  usersWithProgress: number;
  averageCompletion: number;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserAnalytics[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAnalytics();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    // We'll infer from the export button behavior
    try {
      const res = await fetch('/api/admin/analytics/export?format=json');
      if (res.ok) {
        setCurrentUser({ role: 'super_admin' });
      }
    } catch {
      // Not super admin
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch(`/api/admin/analytics?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setUsers(data.users || []);
      setSummary(data.summary || null);
    } catch {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadAnalytics();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/analytics/export');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-analytics-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        alert('Export failed. Only Super Admins can export data.');
      }
    } catch {
      console.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const getLoginStatus = (lastLogin: string | null) => {
    if (!lastLogin) return { label: 'Never', color: 'text-slate-500' };
    const diff = Date.now() - new Date(lastLogin).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return { label: 'Today', color: 'text-green-400' };
    if (days <= 7) return { label: `${days}d ago`, color: 'text-blue-400' };
    if (days <= 30) return { label: `${days}d ago`, color: 'text-yellow-400' };
    return { label: `${days}d ago`, color: 'text-slate-500' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Analytics</h1>
          <p className="text-slate-400">Track user engagement, progress, and quiz performance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-64">
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white"
            />
          </div>
          {currentUser?.role === 'super_admin' && (
            <Button
              onClick={handleExport}
              disabled={exporting}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summary.totalUsers}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Active (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{summary.activeUsers}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">With Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400">{summary.usersWithProgress}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Avg Completion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summary.averageCompletion}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-slate-400 border-b border-slate-700">
                <div className="col-span-3">User</div>
                <div className="col-span-2 text-center">Last Login</div>
                <div className="col-span-2 text-center">Courses</div>
                <div className="col-span-2 text-center">Progress</div>
                <div className="col-span-2 text-center">Quizzes</div>
                <div className="col-span-1 text-center">Time</div>
              </div>

              {/* Rows */}
              {users.map((user) => {
                const loginStatus = getLoginStatus(user.last_login_at);
                return (
                  <div
                    key={user.id}
                    onClick={() => router.push(`/admin/analytics/${user.id}`)}
                    className="grid grid-cols-12 gap-4 px-4 py-3 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    {/* User Info */}
                    <div className="col-span-3 flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-blue-600 text-white text-sm">
                          {getInitials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white truncate text-sm">
                            {user.name || user.email.split('@')[0]}
                          </p>
                          {user.role !== 'learner' && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                user.role === 'super_admin'
                                  ? 'border-red-500 text-red-400'
                                  : 'border-purple-500 text-purple-400'
                              }`}
                            >
                              {user.role}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>

                    {/* Login Status */}
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <span className={`text-sm font-medium ${loginStatus.color}`}>
                        {loginStatus.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {user.login_count} logins
                      </span>
                    </div>

                    {/* Courses */}
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <span className="text-sm text-white">
                        {user.courses_completed}/{user.courses_enrolled}
                      </span>
                      <span className="text-xs text-slate-500">
                        {user.courses_in_progress} in progress
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="col-span-2 flex flex-col items-center justify-center gap-1">
                      <div className="w-full max-w-[100px]">
                        <Progress value={user.overall_progress_percent} className="h-2" />
                      </div>
                      <span className="text-xs text-slate-400">
                        {user.overall_progress_percent}%
                      </span>
                    </div>

                    {/* Quizzes */}
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <span className="text-sm text-white">
                        {user.quizzes_passed}/{user.quizzes_taken}
                      </span>
                      {user.average_quiz_score !== null && (
                        <span className="text-xs text-slate-500">
                          Avg: {Math.round(user.average_quiz_score)}%
                        </span>
                      )}
                    </div>

                    {/* Time */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span className="text-sm text-slate-400">
                        {formatDuration(user.total_time_spent_seconds)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-slate-400">
                {search ? 'No users match your search' : 'No users yet'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
