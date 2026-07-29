'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ASSIGNABLE_ROLES, canManageRoles, roleBadgeClass, roleLabel } from '@/lib/permissions';
import type { User as CurrentUser } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

/** What each role actually grants, shown in the confirmation step. */
const ROLE_CONSEQUENCE: Record<string, string> = {
  super_admin: 'Full control of the platform, including changing other people’s roles.',
  admin: 'Can create and edit all content (courses, lessons, quizzes). Cannot export learner data.',
  auditor:
    'Read-only oversight of every learner’s activity, reports and CSV exports. Cannot change anything.',
  instructor: 'Currently identical to Learner — reserved for future use.',
  learner: 'Standard access: courses, quizzes, search and their own profile.',
};

/** Roles that widen visibility or write access, and so warrant a confirmation. */
const PRIVILEGED = new Set(['super_admin', 'admin', 'auditor']);

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [pending, setPending] = useState<{ user: User; role: string } | null>(null);

  useEffect(() => {
    loadUsers();
    // The role control is only rendered for a super_admin, so the viewer's own
    // role has to be known client-side. Same pattern as /admin/reports, which
    // gates its export button this way. The server re-checks on every PATCH —
    // this only decides what is worth showing.
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const applyRole = async (user: User, role: string) => {
    const previous = user.role;
    setSaving(user.id);
    // Optimistic, then reverted on failure. A role control that appears to have
    // worked when the request was rejected is worse than a slow one.
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));

    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();

      if (!res.ok || !body.success) {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: previous } : u)));
        toast.error(body.error || 'Could not change the role');
        return;
      }

      toast.success(
        `${user.name || user.email} is now ${roleLabel(role)}`,
        body.data?.changed === false ? { description: 'No change — already had that role.' } : undefined
      );
    } catch {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: previous } : u)));
      toast.error('Network error — the role was not changed');
    } finally {
      setSaving(null);
    }
  };

  const requestRoleChange = (user: User, role: string) => {
    if (role === user.role) return;
    // Confirm only where the change grants something. Dropping to Learner is
    // revocation and takes effect immediately, which is the safe direction.
    if (PRIVILEGED.has(role)) {
      setPending({ user, role });
      return;
    }
    void applyRole(user, role);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.name?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  const canEditRoles = canManageRoles(me);

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
          <p className="text-slate-400">
            {users.length} total users
            {canEditRoles ? ' · you can change roles here' : ''}
          </p>
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
                      <Badge variant="outline" className={roleBadgeClass(user.role)}>
                        {roleLabel(user.role)}
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

                  {canEditRoles && (
                    <div className="w-44 shrink-0">
                      {/* Your own row shows no control. The server rejects
                          self-changes anyway; offering the dropdown would only
                          invite the click that gets refused. */}
                      {me && user.id === me.id ? (
                        <p className="text-right text-xs text-slate-500">Your account</p>
                      ) : (
                        <Select
                          value={user.role}
                          disabled={saving === user.id}
                          onValueChange={(role) => requestRoleChange(user, role)}
                        >
                          <SelectTrigger
                            aria-label={`Role for ${user.email}`}
                            className="bg-slate-900/60 border-slate-700 text-slate-200"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                            {ASSIGNABLE_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {roleLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
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

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Grant {pending ? roleLabel(pending.role) : ''} to{' '}
              {pending?.user.name || pending?.user.email}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {pending ? ROLE_CONSEQUENCE[pending.role] : ''}
              {pending && (
                <span className="mt-2 block text-slate-500">
                  Currently {roleLabel(pending.user.role)}. The change is recorded in the role
                  history with your name against it.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 bg-transparent text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 text-white hover:bg-blue-500"
              onClick={() => {
                if (pending) void applyRole(pending.user, pending.role);
                setPending(null);
              }}
            >
              Grant {pending ? roleLabel(pending.role) : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
