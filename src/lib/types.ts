export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: 'super_admin' | 'admin' | 'instructor' | 'learner';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface LoginHistory {
  id: string;
  user_id: string;
  session_id: string | null;
  logged_in_at: string;
  logged_out_at: string | null;
  session_duration_seconds: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  course_count?: number;
}

export interface Course {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_minutes: number;
  is_published: boolean;
  is_mandatory: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
  lessons?: Lesson[];
  lesson_count?: number;
  progress_percent?: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: 'video' | 'text' | 'mixed';
  video_url: string | null;
  video_provider: string;
  text_content: string | null;
  duration_minutes: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  attachments?: LessonAttachment[];
  progress?: LessonProgress;
}

export interface LessonAttachment {
  id: string;
  lesson_id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  sort_order: number;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  due_date: string | null;
  completed_at: string | null;
  course?: Course;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  course_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percent: number;
  time_spent_seconds: number;
  completed_at: string | null;
  last_accessed_at: string;
}

export interface MandatoryAssignment {
  id: string;
  course_id: string;
  assigned_to: 'all' | 'domain' | 'specific';
  domain_filter: string | null;
  user_ids: string[] | null;
  start_date: string | null;
  due_date: string;
  reminder_days: number[];
  created_by: string | null;
  created_at: string;
}

export interface CoursePrerequisite {
  id: string;
  course_id: string;
  prerequisite_course_id: string;
  created_at: string;
}

export interface PrerequisiteStatus {
  course_id: string;
  title: string;
  slug: string;
  is_completed: boolean;
  lessons_completed: number;
  total_lessons: number;
  quiz_passed: boolean;
  quiz_exists: boolean;
}
