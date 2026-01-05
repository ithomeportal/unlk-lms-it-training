'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  enrollments_count: number;
  completed_courses: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      console.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(search.toLowerCase()) ||
    (user.name?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400">{users.length} total users</p>
        </div>
        <div className="w-64">
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800/50 border-slate-700 text-white"
          />
        </div>
      </div>

      {filteredUsers.length > 0 ? (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-600 text-white">
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate">
                        {user.name || user.email}
                      </p>
                      <Badge
                        variant="outline"
                        className={user.role === 'admin' ? 'border-purple-500 text-purple-400' : 'border-slate-600 text-slate-400'}
                      >
                        {user.role}
                      </Badge>
                      {!user.is_active && (
                        <Badge variant="outline" className="border-red-500 text-red-400">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 truncate">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">{user.enrollments_count} courses</p>
                    <p className="text-xs text-slate-400">{user.completed_courses} completed</p>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">
              {search ? 'No users match your search' : 'No users yet'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
