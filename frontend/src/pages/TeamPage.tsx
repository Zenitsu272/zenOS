import { ReactNode, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Copy,
  Flag,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { getMe } from "../api/auth";
import { clearToken } from "../lib/storage";
import ProjectMeetings from "../components/ProjectMeetings";
import type {
  Issue,
  IssueInput,
  Member,
  Project,
  Sprint,
  Status,
  Team,
  Workspace,
} from "../types/team";
import "../team.css";

const columns: { status: Status; name: string; color: string }[] = [
  { status: "scheduled", name: "To do", color: "slate" },
  { status: "ongoing", name: "Doing", color: "purple" },
  { status: "completed", name: "Done", color: "green" },
];
const inColumn = (status: Status, column: Status) =>
  status === column || (column === "ongoing" && status === "review");
const planLabel = (name: string) => name.replace(/^Sprint\b/i, "Plan");
const blankIssue: IssueInput = {
  project_id: null,
  title: "",
  description: "",
  acceptance_criteria: "",
  status: "scheduled",
  priority: "Medium",
  issue_type: "Task",
  points: 0,
  label: "",
  assignee_id: null,
  sprint_id: null,
  due_date: null,
};
const personName = (email: string) => email.split("@")[0].replace(/[._]/g, " ");
const initials = (email: string) =>
  personName(email)
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const dateLabel = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
function Avatar({
  member,
  small = false,
}: {
  member?: Member;
  small?: boolean;
}) {
  return (
    <span
      title={member?.email ?? "No one yet"}
      className={`avatar avatar-${(member?.id ?? 0) % 5} ${small ? "small" : ""}`}
    >
      {member ? initials(member.email) : "–"}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`team-modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [teamId, setTeamId] = useState<number | null>(
    () => Number(localStorage.getItem("zenos_team")) || null,
  );
  const [view, setView] = useState("Projects");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sprintFilter, setSprintFilter] = useState("current");
  const [modal, setModal] = useState<string | null>(null);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [draft, setDraft] = useState<IssueInput>(blankIssue);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropColumn, setDropColumn] = useState<Status | null>(null);
  const [closingSprint, setClosingSprint] = useState<Sprint | null>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiRequest<Team[]>("/teams"),
    refetchInterval: 10000,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: getMe });
  const workspace = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => apiRequest<Workspace>(`/teams/${teamId}/workspace`),
    enabled: !!teamId,
    refetchInterval: 10000,
    retry: false,
  });
  useEffect(() => {
    if (teams.data && !teams.data.some((t) => t.id === teamId))
      setTeamId(teams.data[0]?.id ?? null);
  }, [teams.data, teamId]);
  useEffect(() => {
    if (teamId) localStorage.setItem("zenos_team", String(teamId));
  }, [teamId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  // Do not keep displaying a cached space after a membership check fails.
  const data = workspace.isError ? undefined : workspace.data;
  const team = data?.team;
  const projects = data?.projects ?? [];
  const currentProject =
    projects.find((p) => p.id === projectId) ?? projects[0];
  const issues = (data?.issues ?? []).filter(
    (i) => i.project_id === currentProject?.id,
  );
  const members = data?.members ?? [];
  const sprints = (data?.sprints ?? []).filter(
    (s) => s.project_id === currentProject?.id,
  );
  const isOwner = !!team && team.owner_id === me.data?.id;
  const inviteLink = team?.invite_code
    ? `${window.location.origin}/join/${encodeURIComponent(team.invite_code)}`
    : "";
  const inviteExpired =
    !!team?.invite_expires_at &&
    new Date(team.invite_expires_at).getTime() <= Date.now();
  useEffect(() => {
    if (!data?.projects.length || !teamId) return;
    if (!data.projects.some((p) => p.id === projectId)) {
      const remembered = Number(
        localStorage.getItem(`zenos_project_${teamId}`),
      );
      setProjectId(
        data.projects.find((p) => p.id === remembered)?.id ??
          data.projects[0].id,
      );
    } else {
      localStorage.setItem(`zenos_project_${teamId}`, String(projectId));
    }
  }, [data, teamId, projectId]);
  const activeSprint = sprints.find((s) => s.status === "active");
  const selectedSprint = sprints.find((s) => String(s.id) === sprintFilter);
  const sprintIssues = selectedSprint
    ? issues.filter((i) => i.sprint_id === selectedSprint.id)
    : issues.filter(
        (i) =>
          !i.sprint_id ||
          sprints.find((s) => s.id === i.sprint_id)?.status !== "completed",
      );
  const boardIssues = (sprintFilter === "all" ? issues : sprintIssues).filter(
    (i) => i.status !== "backlog",
  );
  const visible = (items: Issue[]) =>
    items.filter(
      (i) =>
        (!search ||
          `${i.title} ${team?.key}-${i.id} ${i.label}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (assignee === "all" ||
          (assignee === "unassigned"
            ? i.assignee_id === null
            : i.assignee_id === Number(assignee))) &&
        (priority === "all" || i.priority === priority),
    );
  const complete = boardIssues.filter((i) => i.status === "completed");
  const progress = boardIssues.length
    ? Math.round((complete.length / boardIssues.length) * 100)
    : 0;
  async function run(
    action: () => Promise<unknown>,
    message = "",
    close = true,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["team", teamId] }),
        qc.invalidateQueries({ queryKey: ["teams"] }),
      ]);
      if (close) {
        setModal(null);
        setEditing(null);
      }
      if (message) setNotice(message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function openIssue(issue?: Issue, status: Status = "scheduled") {
    setError("");
    setEditing(issue ?? null);
    setComment("");
    setDraft(
      issue
        ? (Object.fromEntries(
            Object.keys(blankIssue).map((k) => [
              k,
              issue[k as keyof IssueInput],
            ]),
          ) as IssueInput)
        : {
            ...blankIssue,
            project_id: currentProject?.id ?? null,
            status,
            sprint_id:
              status === "backlog"
                ? null
                : selectedSprint?.status !== "completed"
                  ? (selectedSprint?.id ?? null)
                  : null,
          },
    );
    setModal("issue");
  }
  function switchTeam(id: number) {
    setTeamId(id);
    setProjectId(null);
    setView("Projects");
    setModal(null);
    setEditing(null);
    setSearch("");
    setAssignee("all");
    setPriority("all");
    setSprintFilter("current");
    setError("");
  }
  function switchProject(id: number, nextView = "Tasks") {
    setProjectId(id);
    setView(nextView);
    setSearch("");
    setAssignee("all");
    setPriority("all");
    setSprintFilter("current");
    setError("");
  }
  function openModal(name: string) {
    setError("");
    setModal(name);
  }
  function move(issue: Issue, status: Status) {
    if (issue.status === status) return;
    void run(
      () =>
        apiRequest(`/teams/${teamId}/issues/${issue.id}/status`, {
          method: "PATCH",
          body: { status },
        }),
      `Task moved to ${columns.find((c) => c.status === status)?.name ?? "Later"}`,
      false,
    );
  }
  const readOnly =
    !!editing?.sprint_id &&
    sprints.find((s) => s.id === editing.sprint_id)?.status === "completed";
  const issueCard = (issue: Issue) => (
    <article
      key={issue.id}
      className={`issue-card ${dragging === issue.id ? "dragging" : ""}`}
      draggable={
        !busy &&
        sprints.find((s) => s.id === issue.sprint_id)?.status !== "completed"
      }
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(issue.id));
        setDragging(issue.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropColumn(null);
      }}
    >
      <button
        className="card-open"
        onClick={() => openIssue(issue)}
        aria-label={`Open ${issue.title}`}
      >
        <div className="card-top">
          <span>
            {issue.status === "review"
              ? "Needs a check"
              : issue.priority === "Urgent" || issue.priority === "High"
                ? "Important"
                : "Team task"}
          </span>
          <MoreHorizontal size={17} />
        </div>
        <h3>{issue.title}</h3>
        {issue.label && (
          <span className={`tag tag-${issue.label.length % 4}`}>
            {issue.label}
          </span>
        )}
      </button>
      <div className="card-meta">
        {issue.due_date && (
          <span className="due-date">
            <CalendarDays size={12} />
            {dateLabel(issue.due_date)}
          </span>
        )}
        <span className="card-spacer" />
        <Avatar
          member={members.find((m) => m.id === issue.assignee_id)}
          small
        />
        <span className="card-person">
          {issue.assignee_id
            ? personName(
                members.find((m) => m.id === issue.assignee_id)?.email ??
                  "Teammate",
              )
            : "Anyone"}
        </span>
      </div>
      {sprints.find((s) => s.id === issue.sprint_id)?.status !==
        "completed" && (
        <button
          className="quick-task-action"
          disabled={busy}
          onClick={() =>
            move(
              issue,
              issue.status === "scheduled"
                ? "ongoing"
                : issue.status === "completed"
                  ? "scheduled"
                  : "completed",
            )
          }
        >
          {issue.status === "scheduled" ? (
            <>
              <ArrowRight size={15} />
              Start task
            </>
          ) : issue.status === "completed" ? (
            <>Move back to To do</>
          ) : (
            <>
              <Check size={15} />
              Mark done
            </>
          )}
        </button>
      )}
    </article>
  );

  return (
    <div className="team-app">
      <aside className="team-sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Zap size={23} fill="currentColor" />
          </span>
          zenOS<span className="brand-team">teams</span>
        </Link>
        <div className="workspace-picker">
          <span className="workspace-icon">
            {team?.name.slice(0, 1) ?? "W"}
          </span>
          <div>
            <small>YOUR SPACE</small>
            <select
              aria-label="Your space"
              value={teamId ?? ""}
              onChange={(e) => switchTeam(Number(e.target.value))}
            >
              {!teams.data?.length && <option value="">Choose a space</option>}
              {teams.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">TOGETHER</p>
        <nav>
          {[
            { name: "Projects", icon: FolderKanban },
            { name: "Tasks", icon: LayoutGrid },
            { name: "Meetings", icon: Video },
            { name: "Later", icon: ListTodo },
            { name: "Progress", icon: BarChart3 },
            { name: "People", icon: Users },
          ].map((n) => (
            <button
              key={n.name}
              className={view === n.name ? "active" : ""}
              onClick={() => setView(n.name)}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Later" && (
                <span className="nav-count">
                  {issues.filter((i) => i.status === "backlog").length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <p className="nav-label">MORE</p>
        <nav>
          <button
            className={view === "Plans" ? "active" : ""}
            onClick={() => setView("Plans")}
          >
            <CalendarDays size={18} />
            Work plans <small className="optional-label">Optional</small>
          </button>
          <button onClick={() => openModal("workspace")}>
            <Plus size={18} />
            New space
          </button>
          <Link to="/personal">
            <FolderKanban size={18} />
            Personal tasks
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="team-tip">
            <span>
              <Zap size={16} /> Small steps. Shared wins.
            </span>
            <p>
              Plan together. Build with focus.
              <br />
              One task at a time.
            </p>
            <button onClick={() => openModal("guide")}>
              How it works <ArrowRight size={14} />
            </button>
          </div>
          <button
            className="profile"
            onClick={() => {
              clearToken();
              qc.clear();
              navigate("/login");
            }}
          >
            <Avatar member={me.data ? { ...me.data, role: "" } : undefined} />
            <span>
              <b>{me.data ? personName(me.data.email) : "Your account"}</b>
              <small>Log out</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="team-main">
        <header className="topbar">
          <div className="breadcrumb">
            Space <span>/</span> <b>{team?.name ?? "Getting started"}</b>{" "}
            <span>/</span> {view}
          </div>
          <div className="topbar-right">
            <span className="sync-dot" />
            Updates automatically
            <button
              className="icon-btn"
              aria-label="How it works"
              onClick={() => openModal("guide")}
            >
              <CircleHelp size={18} />
            </button>
            <Avatar
              member={me.data ? { ...me.data, role: "" } : undefined}
              small
            />
          </div>
        </header>
        <div className="team-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">BUILD SOMETHING GREAT, TOGETHER</div>
              <h1>
                {view === "Tasks"
                  ? "Our tasks"
                  : view === "People"
                    ? "Your team"
                    : view}
              </h1>
              <p>
                {
                  (
                    {
                      Tasks:
                        "Everyone knows what to do, who’s doing it, and what’s done.",
                      Later: "Ideas and tasks you’re not ready to start yet.",
                      Plans:
                        "Optional: group tasks around a shared goal and dates.",
                      Progress:
                        "See what’s finished and who’s working on what.",
                      People:
                        "Everyone with access to this space and its projects.",
                      Projects:
                        "Separate projects. One place to work together.",
                      Meetings:
                        "Plan a conversation, capture decisions, and keep work moving.",
                    } as Record<string, string>
                  )[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              {view === "Projects" && (
                <button
                  className="btn secondary"
                  onClick={() => openModal("workspace")}
                >
                  <Plus size={16} />
                  New space
                </button>
              )}
              {isOwner && (
                <button
                  className="btn secondary"
                  onClick={() => openModal("invite")}
                  disabled={!team}
                >
                  <Users size={16} /> Invite people
                </button>
              )}
              {view !== "Projects" &&
                view !== "People" &&
                view !== "Meetings" && (
                  <button
                    className="btn primary"
                    disabled={!team || !currentProject}
                    onClick={() =>
                      openIssue(
                        undefined,
                        view === "Later" ? "backlog" : "scheduled",
                      )
                    }
                  >
                    <Plus size={17} /> Add task
                  </button>
                )}
            </div>
          </div>
          {(error || teams.error || workspace.error) && (
            <div className="error-banner" role="alert">
              {error ||
                (teams.error as Error)?.message ||
                (workspace.error as Error)?.message}
              <button
                onClick={() => {
                  setError("");
                  void teams.refetch();
                  void workspace.refetch();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {teams.isLoading || (!!teamId && workspace.isLoading) ? (
            <div className="empty-state">
              <Loader2 className="spin" />
              <h2>Loading your space…</h2>
            </div>
          ) : !team ? (
            <div className="welcome-panel">
              <span className="welcome-icon">
                <Users size={32} />
              </span>
              <h2>A space for your people and projects.</h2>
              <p>
                Create a space and you’ll be its owner. Or open an invite link
                from someone you work with.
              </p>
              <button
                className="btn primary"
                onClick={() => openModal("workspace")}
              >
                <Plus size={16} />
                Create or join a space
              </button>
            </div>
          ) : (
            <>
              {view !== "People" && view !== "Projects" && currentProject && (
                <div className="project-context">
                  <span className="project-context-icon">
                    <FolderKanban size={21} />
                  </span>
                  <label>
                    PROJECT
                    <select
                      aria-label="Current project"
                      value={currentProject.id}
                      onChange={(e) =>
                        switchProject(Number(e.target.value), view)
                      }
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="project-context-description">
                    {currentProject.description ||
                      "Tasks, meetings, and work plans for this project"}
                  </span>
                  <button
                    className="btn text"
                    onClick={() => setView("Projects")}
                  >
                    All projects <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {view !== "People" && view !== "Projects" && currentProject && (
                <nav className="project-view-tabs" aria-label="Project pages">
                  <button
                    className={view === "Tasks" ? "active" : ""}
                    onClick={() => setView("Tasks")}
                  >
                    <LayoutGrid size={16} />
                    Task board
                  </button>
                  <button
                    className={view === "Meetings" ? "active" : ""}
                    onClick={() => setView("Meetings")}
                  >
                    <Video size={16} />
                    Meetings
                  </button>
                </nav>
              )}
              {view === "Projects" && (
                <section className="projects-overview">
                  <div className="space-summary">
                    <div>
                      <span className="eyebrow">YOUR SPACE</span>
                      <h2>{team.name}</h2>
                      <p>
                        {team.description ||
                          "All the projects you and your team are working on."}
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        className="btn secondary"
                        onClick={() => openModal("edit-space")}
                      >
                        <Pencil size={16} />
                        Edit space
                      </button>
                    )}
                  </div>
                  <div className="space-access-note">
                    <Users size={17} />
                    <span>
                      {members.length}{" "}
                      {members.length === 1 ? "person has" : "people have"}{" "}
                      access to this space. Members can work on every project
                      here.
                    </span>
                  </div>
                  <div className="section-heading">
                    <h2>
                      {projects.length}{" "}
                      {projects.length === 1 ? "project" : "projects"}
                    </h2>
                    {isOwner && (
                      <button
                        className="btn primary"
                        onClick={() => openModal("project")}
                      >
                        <Plus size={16} />
                        New project
                      </button>
                    )}
                  </div>
                  <div className="project-grid">
                    {projects.map((p) => {
                      const tasks = (data?.issues ?? []).filter(
                        (i) => i.project_id === p.id,
                      );
                      const done = tasks.filter(
                        (i) => i.status === "completed",
                      ).length;
                      const active = (data?.sprints ?? []).find(
                        (s) => s.project_id === p.id && s.status === "active",
                      );
                      return (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => switchProject(p.id)}
                        >
                          <div className="project-card-top">
                            <span className="project-context-icon">
                              <FolderKanban size={22} />
                            </span>
                            <ArrowRight size={18} />
                          </div>
                          <h2>{p.name}</h2>
                          <p>
                            {p.description ||
                              "A shared board for your team’s tasks."}
                          </p>
                          <div className="project-card-counts">
                            <span>
                              {
                                tasks.filter((i) => i.status !== "completed")
                                  .length
                              }{" "}
                              open
                            </span>
                            <span>{done} done</span>
                          </div>
                          <div className="project-card-progress">
                            <i
                              style={{
                                width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <small>
                            {active
                              ? `${planLabel(active.name)} · in progress`
                              : "Open task board"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {view === "Meetings" && currentProject && teamId && (
                <ProjectMeetings
                  key={`${teamId}-${currentProject.id}`}
                  teamId={teamId}
                  project={currentProject}
                  issues={issues}
                  sprints={sprints}
                  onChange={() =>
                    qc.invalidateQueries({ queryKey: ["team", teamId] })
                  }
                />
              )}
              {view === "Tasks" && (
                <>
                  <section className="simple-intro">
                    <span className="intro-icon">
                      <CheckCheck size={25} />
                    </span>
                    <div>
                      <h2>A little progress, together.</h2>
                      <p>
                        Add a task, choose who will do it, and mark it done when
                        it's finished.
                      </p>
                    </div>
                    <button
                      className="btn text"
                      onClick={() => openModal("guide")}
                    >
                      How it works <ArrowRight size={16} />
                    </button>
                  </section>
                  {selectedSprint && (
                    <div className="selected-plan">
                      <CalendarDays size={16} />
                      <span>
                        Showing: <b>{planLabel(selectedSprint.name)}</b> ·{" "}
                        {dateLabel(selectedSprint.start_date)} –{" "}
                        {dateLabel(selectedSprint.end_date)}
                      </span>
                      <button onClick={() => setSprintFilter("current")}>
                        Show all tasks
                      </button>
                    </div>
                  )}
                  <div className="simple-summary">
                    <span>
                      <b>
                        {
                          boardIssues.filter((i) => i.status !== "completed")
                            .length
                        }
                      </b>{" "}
                      tasks to work on
                    </span>
                    <span>
                      <b>{complete.length}</b> done
                    </span>
                    <span>
                      <b>{members.length}</b> teammates
                    </span>
                  </div>
                </>
              )}
              {(view === "Tasks" || view === "Later") && (
                <>
                  <div className="board-toolbar">
                    <label className="board-search">
                      <Search size={16} />
                      <input
                        aria-label="Search tasks"
                        placeholder="Search tasks…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter by person"
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    >
                      <option value="all">Everyone</option>
                      <option value="unassigned">No one yet</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {personName(m.email)}
                        </option>
                      ))}
                    </select>
                    <details className="extra-filters">
                      <summary>More filters</summary>
                      <div>
                        {" "}
                        <select
                          aria-label="Filter by priority"
                          value={priority}
                          onChange={(e) => setPriority(e.target.value)}
                        >
                          <option value="all">All priorities</option>
                          {["Urgent", "High", "Medium", "Low"].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <span className="toolbar-spacer" />
                        {view === "Tasks" && (
                          <select
                            aria-label="Filter by plan"
                            value={sprintFilter}
                            onChange={(e) => setSprintFilter(e.target.value)}
                          >
                            <option value="current">All current tasks</option>
                            <option value="all">Include finished plans</option>
                            {sprints.map((s) => (
                              <option value={s.id} key={s.id}>
                                {planLabel(s.name)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </details>
                    <span className="toolbar-spacer" />{" "}
                    <button
                      className="btn text"
                      onClick={() => {
                        setCsvText("");
                        setFileName("");
                        openModal("import");
                      }}
                    >
                      <Upload size={15} />
                      Upload tasks
                    </button>
                  </div>
                </>
              )}
              {view === "Tasks" && (
                <>
                  <section className="kanban-grid">
                    {columns.map((col) => (
                      <div
                        key={col.status}
                        className={`kanban-column ${dropColumn === col.status ? "drop-target" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropColumn(col.status);
                        }}
                        onDragLeave={() => setDropColumn(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const issue = issues.find(
                            (i) =>
                              i.id ===
                              Number(e.dataTransfer.getData("text/plain")),
                          );
                          setDropColumn(null);
                          setDragging(null);
                          if (issue) move(issue, col.status);
                        }}
                      >
                        <header className={`column-heading ${col.color}`}>
                          <span className="column-dot" />
                          <h2>{col.name}</h2>
                          <span className="column-count">
                            {
                              visible(boardIssues).filter((i) =>
                                inColumn(i.status, col.status),
                              ).length
                            }
                          </span>
                          <button
                            className="icon-btn"
                            aria-label={`Add ${col.name} task`}
                            onClick={() => openIssue(undefined, col.status)}
                          >
                            <Plus size={17} />
                          </button>
                        </header>
                        <div className="column-cards">
                          {visible(boardIssues)
                            .filter((i) => inColumn(i.status, col.status))
                            .map(issueCard)}
                          {visible(boardIssues).filter((i) =>
                            inColumn(i.status, col.status),
                          ).length === 0 && (
                            <div className="column-empty">
                              No tasks here yet.
                              <br />
                              Drop a task here or create one.
                            </div>
                          )}
                          <button
                            className="add-card"
                            onClick={() => openIssue(undefined, col.status)}
                          >
                            <Plus size={16} />
                            Add task
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                  <footer className="board-footer">
                    <span>
                      <span className="sync-dot" />
                      Changes save automatically
                    </span>
                    <span>
                      Use Start task or Mark done. You can also drag tasks.
                    </span>
                  </footer>
                  <div className="progress-strip">
                    <span>Tasks finished</span>
                    <div>
                      <i style={{ width: `${progress}%` }} />
                    </div>
                    <b>{progress}%</b>
                    <span>
                      {complete.length} of {boardIssues.length} tasks completed
                    </span>
                  </div>
                </>
              )}
              {view === "Later" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Saved for later{" "}
                        <span className="count-badge">
                          {issues.filter((i) => i.status === "backlog").length}
                        </span>
                      </h2>
                      <p>
                        Save an idea here. Move it to To do when you’re ready.
                      </p>
                    </div>
                    <button
                      className="btn secondary"
                      onClick={() => openIssue(undefined, "backlog")}
                    >
                      <Plus size={16} />
                      Save for later
                    </button>
                  </div>
                  <div className="task-table">
                    <div className="table-head">
                      <span>Task</span>
                      <span>Priority</span>
                      <span>Person</span>
                      <span>Due</span>
                      <span>Plan</span>
                    </div>
                    {visible(issues.filter((i) => i.status === "backlog")).map(
                      (issue) => (
                        <div className="table-row" key={issue.id}>
                          <button onClick={() => openIssue(issue)}>
                            <small>
                              {team.key}-{issue.id}
                            </small>
                            <b>{issue.title}</b>
                          </button>
                          <span
                            className={`priority priority-${issue.priority.toLowerCase()}`}
                          >
                            {issue.priority}
                          </span>
                          <Avatar
                            member={members.find(
                              (m) => m.id === issue.assignee_id,
                            )}
                            small
                          />
                          <span className="muted">
                            {issue.due_date
                              ? dateLabel(issue.due_date)
                              : "No date"}
                          </span>
                          <button
                            className="btn text"
                            onClick={() => move(issue, "scheduled")}
                            disabled={busy}
                          >
                            Move to To do <ArrowRight size={14} />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                  {!visible(issues.filter((i) => i.status === "backlog"))
                    .length && (
                    <div className="empty-state">
                      <ListTodo size={30} />
                      <h3>Nothing saved for later</h3>
                      <p>Add a task or adjust your filters.</p>
                    </div>
                  )}
                </section>
              )}
              {view === "Plans" && (
                <>
                  <div className="section-heading">
                    <h2>
                      Work plans{" "}
                      <span className="count-badge">{sprints.length}</span>
                    </h2>
                    {isOwner && (
                      <button
                        className="btn primary"
                        onClick={() => openModal("sprint")}
                      >
                        <Plus size={16} />
                        New plan
                      </button>
                    )}
                  </div>
                  {!sprints.length && (
                    <div className="empty-state">
                      <Zap size={30} />
                      <h3>Make a plan, if you need one</h3>
                      <p>
                        Pick a shared goal and a date. Or use Tasks without a
                        plan.
                      </p>
                    </div>
                  )}
                  <div className="sprint-list">
                    {[...sprints].reverse().map((s) => {
                      const tasks = issues.filter((i) => i.sprint_id === s.id);
                      const done = tasks.filter(
                        (i) => i.status === "completed",
                      );
                      return (
                        <section className="panel sprint-panel" key={s.id}>
                          <div className="panel-heading">
                            <div>
                              <div className="inline-heading">
                                <h2>{planLabel(s.name)}</h2>
                                <span
                                  className={`status-pill ${s.status === "active" ? "In progress" : s.status === "completed" ? "Finished" : "Not started"}`}
                                >
                                  {s.status === "active"
                                    ? "In progress"
                                    : s.status === "completed"
                                      ? "Finished"
                                      : "Not started"}
                                </span>
                              </div>
                              <p>{s.goal || "No goal added"}</p>
                            </div>
                            <span className="muted">
                              {dateLabel(s.start_date)} –{" "}
                              {dateLabel(s.end_date)}
                            </span>
                          </div>
                          <div className="sprint-panel-bottom">
                            <span>
                              {tasks.length} tasks · {done.length} completed ·{" "}
                              {tasks.length - done.length} remaining
                            </span>
                            <div>
                              <button
                                className="btn secondary"
                                onClick={() => {
                                  setSprintFilter(String(s.id));
                                  setView("Tasks");
                                }}
                              >
                                View tasks <ArrowRight size={14} />
                              </button>
                              {isOwner && s.status === "planned" && (
                                <button
                                  className="btn primary"
                                  disabled={busy || !!activeSprint}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        apiRequest(
                                          `/teams/${teamId}/sprints/${s.id}`,
                                          {
                                            method: "PATCH",
                                            body: { status: "active" },
                                          },
                                        ),
                                      "Plan started",
                                    )
                                  }
                                >
                                  <Zap size={14} />
                                  Start plan
                                </button>
                              )}
                              {isOwner && s.status === "active" && (
                                <button
                                  className="btn primary"
                                  onClick={() => {
                                    setClosingSprint(s);
                                    openModal("complete");
                                  }}
                                >
                                  Finish plan
                                </button>
                              )}
                            </div>
                          </div>
                          {s.retrospective && (
                            <div className="retro">
                              <b>What we learned</b>
                              <p>{s.retrospective}</p>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  {activeSprint && (
                    <p className="hint">
                      Your team can focus on one plan at a time. Finish the
                      current plan before starting another.
                    </p>
                  )}
                </>
              )}
              {view === "Progress" && (
                <div className="reports-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Where things stand</h2>
                        <p>All your team’s tasks, at a glance</p>
                      </div>
                      <BarChart3 size={20} />
                    </div>
                    {[
                      { status: "backlog", name: "Later", color: "slate" },
                      ...columns,
                    ].map((c) => {
                      const count = issues.filter((i) =>
                        inColumn(i.status, c.status as Status),
                      ).length;
                      return (
                        <div className="report-bar" key={c.status}>
                          <span>{c.name}</span>
                          <div>
                            <i
                              className={c.color}
                              style={{
                                width: `${issues.length ? (count / issues.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <b>{count}</b>
                        </div>
                      );
                    })}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Who’s doing what</h2>
                        <p>Open tasks assigned to each teammate</p>
                      </div>
                      <Users size={20} />
                    </div>
                    {members.map((m) => (
                      <div className="workload-row" key={m.id}>
                        <Avatar member={m} small />
                        <span>{personName(m.email)}</span>
                        <b>
                          {
                            issues.filter(
                              (i) =>
                                i.assignee_id === m.id &&
                                i.status !== "completed",
                            ).length
                          }
                        </b>
                        <small>tasks</small>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Finished plans</h2>
                        <p>Tasks finished in each plan</p>
                      </div>
                      <Zap size={20} />
                    </div>
                    {sprints
                      .filter((s) => s.status === "completed")
                      .map((s) => (
                        <div className="delivery-row" key={s.id}>
                          <span>{planLabel(s.name)}</span>
                          <b>
                            {
                              issues.filter(
                                (i) =>
                                  i.sprint_id === s.id &&
                                  i.status === "completed",
                              ).length
                            }{" "}
                            tasks done
                          </b>
                        </div>
                      ))}
                    {!sprints.some((s) => s.status === "completed") && (
                      <div className="empty-state compact">
                        <Flag size={24} />
                        <p>Finished plans will appear here.</p>
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Recent updates</h2>
                        <p>The latest updates from your team</p>
                      </div>
                      <Activity size={20} />
                    </div>
                    <div className="activity-list">
                      {data?.activity.map((a) => (
                        <div key={a.id}>
                          <span className="activity-dot" />
                          <p>
                            <b>{personName(a.email)}</b> {a.message}
                            <small>
                              {new Date(
                                a.created_at +
                                  (a.created_at.endsWith("Z") ? "" : "Z"),
                              ).toLocaleString()}
                            </small>
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              {view === "People" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Space members{" "}
                        <span className="count-badge">{members.length}</span>
                      </h2>
                      <p>
                        Everyone here can create, assign, and update shared
                        tasks.
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        className="btn secondary"
                        onClick={() => openModal("invite")}
                      >
                        <Users size={16} />
                        Invite people
                      </button>
                    )}
                  </div>
                  {members.map((m) => (
                    <div className="member-row" key={m.id}>
                      <Avatar member={m} />
                      <div>
                        <b>
                          {personName(m.email)}
                          {m.id === me.data?.id ? " (you)" : ""}
                        </b>
                        <small>{m.email}</small>
                      </div>
                      <span className="role-badge">
                        {m.id === team.owner_id ? "Space owner" : "Member"}
                      </span>
                      {isOwner && m.id !== team.owner_id && (
                        <button
                          className="btn text remove-member"
                          onClick={() => {
                            setRemovingMember(m);
                            openModal("remove");
                          }}
                          aria-label={`Remove ${m.email}`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "issue"
              ? editing
                ? "Edit task"
                : "Add a task"
              : (
                  {
                    workspace: "Create a space",
                    "edit-space": "Edit this space",
                    project: "Create a project",
                    remove: "Remove access to this space?",
                    invite: "Better together",
                    sprint: "Make a work plan",
                    complete: "Finish plan",
                    import: "Upload a task list",
                    guide: "How it works",
                  } as Record<string, string>
                )[modal]
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
          wide={modal === "issue"}
        >
          {error && (
            <div className="modal-error" role="alert">
              {error}
            </div>
          )}
          {modal === "issue" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  async () => {
                    await apiRequest(
                      `/teams/${teamId}/issues${editing ? `/${editing.id}` : ""}`,
                      { method: editing ? "PUT" : "POST", body: draft },
                    );
                    if (!editing) {
                      setSearch("");
                      setAssignee("all");
                      setPriority("all");
                      setSprintFilter("current");
                      setView(draft.status === "backlog" ? "Later" : "Tasks");
                    }
                  },
                  editing ? "Task updated" : "Task added",
                );
              }}
            >
              <div className="modal-body">
                <p className="task-project-note">
                  <FolderKanban size={15} />
                  {team?.name} / {currentProject?.name}
                </p>
                <fieldset disabled={busy || readOnly}>
                  <label>
                    What needs to be done?
                    <input
                      autoFocus
                      required
                      maxLength={180}
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                      placeholder="What needs to get done?"
                    />
                  </label>
                  <p className="form-helper">
                    A title is all you need. Everything else can wait.
                  </p>
                  <div className="form-grid">
                    <label>
                      Who will do it?
                      <select
                        value={draft.assignee_id ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            assignee_id: Number(e.target.value) || null,
                          })
                        }
                      >
                        <option value="">Choose later</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {personName(m.email)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Due date (optional)
                      <input
                        type="date"
                        value={draft.due_date ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            due_date: e.target.value || null,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Notes (optional)
                    <textarea
                      rows={3}
                      maxLength={10000}
                      value={draft.description}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      placeholder="Anything your teammate should know?"
                    />
                  </label>
                  <details className="task-options">
                    <summary>
                      More options <span>Status, importance, and planning</span>
                    </summary>
                    <div className="form-grid">
                      <label>
                        Where is it now?
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              status: e.target.value as Status,
                              sprint_id:
                                e.target.value === "backlog"
                                  ? null
                                  : draft.sprint_id,
                            })
                          }
                        >
                          <option value="backlog">Later</option>
                          <option value="review">Needs a check</option>
                          {columns.map((c) => (
                            <option key={c.status} value={c.status}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        How important is it?
                        <select
                          value={draft.priority}
                          onChange={(e) =>
                            setDraft({ ...draft, priority: e.target.value })
                          }
                        >
                          {["Low", "Medium", "High", "Urgent"].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Work plan (optional)
                        <select
                          value={draft.sprint_id ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              sprint_id: Number(e.target.value) || null,
                              status:
                                e.target.value && draft.status === "backlog"
                                  ? "scheduled"
                                  : draft.status,
                            })
                          }
                        >
                          <option value="">No plan needed</option>
                          {sprints
                            .filter(
                              (s) =>
                                s.status !== "completed" ||
                                s.id === draft.sprint_id,
                            )
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {planLabel(s.name)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Group (optional)
                        <input
                          maxLength={60}
                          value={draft.label}
                          onChange={(e) =>
                            setDraft({ ...draft, label: e.target.value })
                          }
                          placeholder="e.g. Marketing"
                        />
                      </label>
                    </div>
                    <label>
                      What needs to be finished? (optional)
                      <textarea
                        rows={2}
                        maxLength={10000}
                        value={draft.acceptance_criteria}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            acceptance_criteria: e.target.value,
                          })
                        }
                        placeholder="How will the team know this is done?"
                      />
                    </label>
                  </details>
                </fieldset>
                {readOnly && (
                  <p className="hint">
                    This plan is finished. These tasks are saved as a record;
                    you can still discuss them below.
                  </p>
                )}
                {editing && (
                  <section className="comments">
                    <h3>
                      <MessageSquare size={16} /> Comments
                    </h3>
                    {data?.comments
                      .filter((c) => c.issue_id === editing.id)
                      .map((c) => (
                        <div className="comment" key={c.id}>
                          <b>{personName(c.email)}</b>
                          <p>{c.body}</p>
                        </div>
                      ))}
                    <label className="sr-only" htmlFor="comment">
                      Add a comment
                    </label>
                    <textarea
                      id="comment"
                      rows={2}
                      maxLength={5000}
                      placeholder="Share an update with your team…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy || !comment.trim()}
                      onClick={() =>
                        void run(
                          async () => {
                            await apiRequest(
                              `/teams/${teamId}/issues/${editing.id}/comments`,
                              { method: "POST", body: { body: comment } },
                            );
                            setComment("");
                          },
                          "Comment added",
                          false,
                        )
                      }
                    >
                      Post comment
                    </button>
                  </section>
                )}
              </div>
              <footer>
                {editing && !readOnly && (
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete “${editing.title}”? This cannot be undone.`,
                        )
                      )
                        void run(
                          () =>
                            apiRequest(
                              `/teams/${teamId}/issues/${editing.id}`,
                              { method: "DELETE" },
                            ),
                          "Task deleted",
                        );
                    }}
                  >
                    Delete task
                  </button>
                )}
                <span />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                {!readOnly && (
                  <button className="btn primary" disabled={busy}>
                    {busy ? "Saving…" : editing ? "Save changes" : "Add task"}
                  </button>
                )}
              </footer>
            </form>
          )}
          {modal === "workspace" && (
            <div className="modal-body">
              <p className="modal-intro">
                One place for your team's plans, progress, and shared wins.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const t = await apiRequest<Team>("/teams", {
                      method: "POST",
                      body: {
                        name: f.get("name"),
                        description: f.get("description"),
                        key: (
                          String(f.get("name"))
                            .toUpperCase()
                            .replace(/[^A-Z]/g, "")
                            .slice(0, 6) + "TM"
                        ).slice(0, 10),
                      },
                    });
                    qc.setQueryData<Team[]>(["teams"], (old) => [
                      ...(old ?? []).filter((item) => item.id !== t.id),
                      t,
                    ]);
                    switchTeam(t.id);
                  }, "Space created");
                }}
              >
                <label>
                  Space name
                  <input
                    required
                    name="name"
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Product & Engineering"
                  />
                </label>
                <label>
                  What is this space for? (optional)
                  <textarea
                    name="description"
                    rows={2}
                    maxLength={2000}
                    placeholder="Help your team understand what belongs here."
                  />
                </label>
                <button className="btn primary" disabled={busy}>
                  Create space <ArrowRight size={16} />
                </button>
              </form>
              <div className="or-divider">or join an existing space</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const t = await apiRequest<Team>("/teams/join", {
                      method: "POST",
                      body: {
                        code: (() => {
                          const invitation = String(f.get("code") ?? "").trim();
                          if (!invitation.includes("/")) return invitation;
                          const match = new URL(
                            invitation,
                            window.location.origin,
                          ).pathname.match(
                            /^\/join\/([A-Za-z0-9_-]{16,64})\/?$/,
                          );
                          if (!match)
                            throw new Error(
                              "Paste a valid space invitation link.",
                            );
                          return match[1];
                        })(),
                      },
                    });
                    qc.setQueryData<Team[]>(["teams"], (old) => [
                      ...(old ?? []).filter((item) => item.id !== t.id),
                      t,
                    ]);
                    switchTeam(t.id);
                  }, "You joined the space");
                }}
              >
                <label>
                  Invite link or code
                  <input
                    name="code"
                    required
                    minLength={10}
                    maxLength={2048}
                    placeholder="Paste the invitation from your space owner"
                  />
                </label>
                <button className="btn secondary" disabled={busy}>
                  Join space
                </button>
              </form>
            </div>
          )}
          {modal === "edit-space" && team && isOwner && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                void run(async () => {
                  const updated = await apiRequest<Team>(`/teams/${teamId}`, {
                    method: "PUT",
                    body: Object.fromEntries(values),
                  });
                  qc.setQueryData<Team[]>(["teams"], (old) =>
                    old?.map((item) =>
                      item.id === updated.id ? updated : item,
                    ),
                  );
                  qc.setQueryData<Workspace>(["team", teamId], (old) =>
                    old ? { ...old, team: updated } : old,
                  );
                }, "Space updated");
              }}
            >
              <div className="modal-body">
                <p className="modal-intro">
                  Give your space a clear name and a short description for
                  everyone invited here.
                </p>
                <label>
                  Space name
                  <input
                    name="name"
                    defaultValue={team.name}
                    required
                    minLength={2}
                    maxLength={100}
                    autoFocus
                  />
                </label>
                <label>
                  What is this space for? (optional)
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={team.description}
                    maxLength={2000}
                  />
                </label>
              </div>
              <footer>
                <span />
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="btn primary" disabled={busy}>
                  Save space
                </button>
              </footer>
            </form>
          )}
          {modal === "invite" && (
            <div className="modal-body">
              <div className="invite-illustration">
                <Users size={36} />
              </div>
              <h3>Invite people to {team?.name}</h3>
              <p className="modal-intro">
                Share this link with your teammates. They’ll sign in or create
                an account, then enter this space. They can work on all its
                projects.
              </p>
              {isOwner && team?.invite_code ? (
                <>
                  <label>
                    Invite link
                    <div className="copy-field">
                      <input readOnly value={inviteLink} />
                      <button
                        className="btn secondary"
                        disabled={busy || inviteExpired}
                        onClick={() =>
                          void run(
                            () => navigator.clipboard.writeText(inviteLink),
                            "Invite link copied",
                            false,
                          )
                        }
                      >
                        <Copy size={16} />
                        Copy link
                      </button>
                    </div>
                  </label>
                  <p className="hint">
                    {inviteExpired
                      ? "This link has expired. Make a new one below."
                      : `Anyone with this link can join until ${team.invite_expires_at ? new Date(team.invite_expires_at).toLocaleString() : "it expires"}. Share it only with people you want in this space.`}
                  </p>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          apiRequest(`/teams/${teamId}/rotate-invite`, {
                            method: "POST",
                          }),
                        "New invite link created. The old link no longer works.",
                        false,
                      )
                    }
                  >
                    Make a new invite link
                  </button>
                  <p className="hint">
                    Making a new link does not remove current members. You can
                    remove people on the People page.
                  </p>
                  {["localhost", "127.0.0.1", "[::1]"].includes(
                    window.location.hostname,
                  ) && (
                    <div className="local-link-note">
                      This app is running on your computer. Links will work for
                      teammates on other devices after the app is deployed to a
                      shared web address.
                    </div>
                  )}
                </>
              ) : (
                <p className="hint">Ask the space owner for an invite link.</p>
              )}
            </div>
          )}
          {modal === "project" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void run(async () => {
                  const project = await apiRequest<Project>(
                    `/teams/${teamId}/projects`,
                    { method: "POST", body: Object.fromEntries(values) },
                  );
                  qc.setQueryData<Workspace>(["team", teamId], (old) =>
                    old
                      ? { ...old, projects: [...old.projects, project] }
                      : old,
                  );
                  switchProject(project.id);
                }, "Project created");
              }}
            >
              <div className="modal-body">
                <p className="modal-intro">
                  A project has its own tasks, progress, and work plans.
                  Everyone in {team?.name} will have access.
                </p>
                <label>
                  Project name
                  <input
                    autoFocus
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Website launch"
                  />
                </label>
                <label>
                  What is this project for? (optional)
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={2000}
                    placeholder="A short description helps everyone find the right project."
                  />
                </label>
              </div>
              <footer>
                <span />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="btn primary" disabled={busy}>
                  Create project
                </button>
              </footer>
            </form>
          )}
          {modal === "remove" && removingMember && (
            <div className="modal-body">
              <p className="modal-intro">
                <b>{removingMember.email}</b> will lose access to every project
                in {team?.name}. Their previous work and comments will stay.
                Unfinished tasks assigned to them will become unassigned.
              </p>
              <p className="hint">
                The current invite link will also be replaced, so they cannot
                use it to rejoin. Share the new link only with people you want
                to invite.
              </p>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      apiRequest(
                        `/teams/${teamId}/members/${removingMember.id}`,
                        { method: "DELETE" },
                      ),
                    "Access removed. A new invite link is ready.",
                  )
                }
              >
                Remove from space
              </button>
            </div>
          )}
          {modal === "sprint" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    apiRequest(`/teams/${teamId}/sprints`, {
                      method: "POST",
                      body: {
                        ...Object.fromEntries(f),
                        project_id: currentProject?.id,
                      },
                    }),
                  "Plan saved",
                );
              }}
            >
              <div className="modal-body">
                <label>
                  Plan name
                  <input
                    name="name"
                    autoFocus
                    required
                    maxLength={100}
                    placeholder="e.g. October launch"
                  />
                </label>
                <label>
                  What do you want to finish?
                  <textarea
                    name="goal"
                    rows={3}
                    maxLength={5000}
                    placeholder="e.g. Get our new website ready to share"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Start date
                    <input name="start_date" type="date" required />
                  </label>
                  <label>
                    End date
                    <input name="end_date" type="date" required />
                  </label>
                </div>
                <p className="hint">
                  To add tasks, open one and choose this plan under More
                  options.
                </p>
              </div>
              <footer>
                <span />
                <button className="btn primary" disabled={busy}>
                  Save plan
                </button>
              </footer>
            </form>
          )}
          {modal === "complete" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    apiRequest(
                      `/teams/${teamId}/sprints/${closingSprint?.id}`,
                      {
                        method: "PATCH",
                        body: {
                          status: "completed",
                          retrospective: f.get("retrospective"),
                        },
                      },
                    ),
                  "Plan finished. Unfinished tasks are saved in Later.",
                );
              }}
            >
              <div className="modal-body">
                <h3>{closingSprint ? planLabel(closingSprint.name) : ""}</h3>
                <p className="modal-intro">
                  {
                    issues.filter(
                      (i) =>
                        i.sprint_id === closingSprint?.id &&
                        i.status === "completed",
                    ).length
                  }{" "}
                  finished tasks will stay in this plan.{" "}
                  {
                    issues.filter(
                      (i) =>
                        i.sprint_id === closingSprint?.id &&
                        i.status !== "completed",
                    ).length
                  }{" "}
                  unfinished tasks will move to Later so nothing is lost.
                </p>
                <label>
                  What we learned
                  <textarea
                    name="retrospective"
                    rows={5}
                    maxLength={10000}
                    placeholder="What went well? What could improve? What will we try next?"
                  />
                </label>
              </div>
              <footer>
                <span />
                <button className="btn primary" disabled={busy}>
                  Finish plan
                </button>
              </footer>
            </form>
          )}
          {modal === "import" && (
            <div className="modal-body">
              <p className="modal-intro">
                Upload up to 200 tasks at once. Every row is checked before
                anything is saved.
              </p>
              <label className="upload-zone">
                <Upload size={28} />
                <b>{fileName || "Choose a CSV file"}</b>
                <span>CSV · up to 500 KB</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCsvText("");
                    setFileName("");
                    if (file.size > 500000) {
                      setError("Choose a CSV smaller than 500 KB");
                      return;
                    }
                    setError("");
                    setFileName(file.name);
                    setCsvText(await file.text());
                  }}
                />
              </label>
              <p className="hint">
                Start with our example, add your tasks in Excel or Google
                Sheets, then save it as a CSV file. Only the Task column is
                required. Use To do, Doing, Done, or Later for Status.
              </p>
              <a
                className="template-download"
                download="task-list.csv"
                href={
                  "data:text/csv;charset=utf-8," +
                  encodeURIComponent(
                    "Task,Status,Due date,Notes\nPrepare the presentation,To do,,Add the latest photos\nBook the meeting room,Doing,,\nShare the agenda,Done,,\nPlan the next event,Later,,\n",
                  )
                }
              >
                Download example file <ArrowDown size={14} />
              </a>
              <p className="hint">
                Dates are optional. If you add them, use YYYY-MM-DD (for
                example, 2026-10-20).
              </p>
              <button
                className="btn primary"
                disabled={busy || !csvText}
                onClick={() =>
                  void run(async () => {
                    const result = await apiRequest<{ imported: number }>(
                      `/teams/${teamId}/import`,
                      {
                        method: "POST",
                        body: { csv: csvText, project_id: currentProject?.id },
                      },
                    );
                    setSearch("");
                    setAssignee("all");
                    setPriority("all");
                    setSprintFilter("current");
                    setView("Tasks");
                    setNotice(
                      `${result.imported} tasks imported. Find them in Tasks or Later.`,
                    );
                  }, "")
                }
              >
                {busy ? "Importing…" : "Import tasks"}
              </button>
            </div>
          )}
          {modal === "guide" && (
            <div className="modal-body playbook">
              <p>
                <b>1. Add something to do.</b> Click “Add task” and give it a
                short name. You can choose a teammate and a date, or leave those
                for later.
              </p>
              <p>
                <b>2. Keep everyone in the loop.</b> Click “Start task” when you
                begin, then “Mark done” when you finish. Open any task to add
                notes or a comment.
              </p>
              <p>
                <b>3. Save ideas for later.</b> Put work you're not ready to
                start in “Later.” Move it to “To do” whenever you're ready.
              </p>
              <p>
                <b>Want a shared deadline?</b> Optional work plans group tasks
                around a goal and dates. You can use the whole app without
                creating one.
              </p>
              <p>
                <b>One space, many projects.</b> The space owner can add
                projects and invite people with a link. Each person signs in to
                their own account and sees only the spaces they belong to.
              </p>
              <p>
                <b>Meet, decide, and follow up.</b> Open a project’s Meetings
                page to schedule a time and share a call link. Afterward, save
                notes and update tasks. Completed meetings keep the notes and a
                record of task changes.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
