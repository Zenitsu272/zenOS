import type { Status } from "./team";

export interface MeetingTaskUpdate {
  id: number;
  issue_id: number | null;
  issue_title: string;
  from_status: Status;
  to_status: Status;
  user_email: string;
  created_at: string;
}

export interface Meeting {
  id: number;
  team_id: number;
  project_id: number;
  title: string;
  agenda: string;
  meeting_url: string | null;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed";
  notes: string;
  created_by: number;
  created_by_email: string;
  completed_at: string | null;
  task_updates: MeetingTaskUpdate[];
}

export interface MeetingInput {
  title: string;
  agenda: string;
  meeting_url: string;
  starts_at: string;
  ends_at: string;
}

export interface MeetingReviewInput {
  notes: string;
  task_updates: { issue_id: number; status: Status }[];
  complete: boolean;
}
