export type TaskType = "Daily" | "Long Term";
export type Priority = "Low" | "Medium" | "High";

export interface User {
  id: number;
  email: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Subbranch {
  id: number;
  user_id: number;
  category_id: number;
  name: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  category_id: number;
  subbranch_id: number;
  category_name?: string | null;
  subbranch_name?: string | null;
  task_type: TaskType;
  due_date?: string | null;
  priority: Priority;
  estimated_hours: number;
  progress: number;
  completed: boolean;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  priority_score: number;
}

export interface TaskPayload {
  title: string;
  description?: string | null;
  category_id: number;
  subbranch_id: number;
  task_type: TaskType;
  due_date?: string | null;
  priority: Priority;
  estimated_hours: number;
  progress: number;
  completed: boolean;
}

export interface CategoryProgress {
  category_id: number;
  category_name: string;
  total_tasks: number;
  completed_tasks: number;
  progress: number;
}

export interface SuggestedTask {
  id: number;
  title: string;
  category_name?: string | null;
  subbranch_name?: string | null;
  due_date?: string | null;
  priority: Priority;
  priority_score: number;
}

export interface DashboardStats {
  tasks_completed_today: number;
  tasks_pending: number;
  overdue_count: number;
  streak_days: number;
  top_active_category_this_week?: string | null;
  progress_by_category: CategoryProgress[];
  suggested_today: SuggestedTask[];
}
