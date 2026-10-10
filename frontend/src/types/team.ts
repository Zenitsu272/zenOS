export type Status =
  "backlog" | "scheduled" | "ongoing" | "review" | "completed";
export type Team = {
  id: number;
  name: string;
  key: string;
  description: string;
  role: string;
  owner_id: number;
  invite_code: string | null;
  invite_expires_at: string | null;
};
export type Project = {
  id: number;
  team_id: number;
  name: string;
  description: string;
};
export type Member = { id: number; email: string; role: string };
export type Sprint = {
  id: number;
  project_id: number;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: "planned" | "active" | "completed";
  retrospective: string;
};
export type IssueInput = {
  project_id: number | null;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: Status;
  priority: string;
  issue_type: string;
  points: number;
  label: string;
  assignee_id: number | null;
  sprint_id: number | null;
  due_date: string | null;
};
export type Issue = IssueInput & {
  id: number;
  reporter_id: number;
  created_at: string;
  updated_at: string;
};
export type Workspace = {
  team: Team;
  projects: Project[];
  project_memberships: { project_id: number; user_id: number }[];
  members: Member[];
  sprints: Sprint[];
  issues: Issue[];
  comments: {
    id: number;
    issue_id: number;
    email: string;
    body: string;
    created_at: string;
  }[];
  activity: {
    id: number;
    email: string;
    message: string;
    created_at: string;
  }[];
};
