import { FormEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, CheckCheck, Clock3, ExternalLink, FileText, History, Loader2, Pencil, Plus, Video, X } from "lucide-react";

import { apiRequest } from "../api/client";
import type { Issue, Project, Sprint, Status } from "../types/team";
import type { Meeting, MeetingInput, MeetingReviewInput, MeetingTaskUpdate } from "../types/meeting";
import "../meetings.css";

interface Props {
  teamId: number;
  project: Project;
  issues: Issue[];
  sprints: Sprint[];
  onChange: () => Promise<unknown> | void;
}

const statusNames: Record<Status, string> = {
  backlog: "Later",
  scheduled: "To do",
  ongoing: "Doing",
  review: "Needs check",
  completed: "Done",
};
const statuses = Object.keys(statusNames) as Status[];
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function localDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function meetingTime(meeting: Meeting) {
  const start = new Date(meeting.starts_at);
  const end = new Date(meeting.ends_at);
  const endDay = start.toDateString() === end.toDateString() ? "" : `${dateFormat.format(end)}, `;
  return `${dateFormat.format(start)} · ${timeFormat.format(start)} – ${endDay}${timeFormat.format(end)}`;
}

function safeMeetingUrl(value: string | null) {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function MeetingLink({ value }: { value: string | null }) {
  const url = safeMeetingUrl(value);
  return url ? <a className="btn secondary" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Video size={15} />Join call<ExternalLink size={12} /></a> : null;
}

function MeetingDialog({ title, busy, children, onClose }: { title: string; busy: boolean; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={ref} className="team-modal meeting-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" disabled={busy} onClick={onClose} aria-label="Close meeting"><X size={20} /></button></header>
    {children}
  </dialog>;
}

function ScheduleMeeting({ endpoint, project, meeting, onSave, onClose }: {
  endpoint: string;
  project: Project;
  meeting?: Meeting;
  onSave: (meeting: Meeting) => Promise<void>;
  onClose: () => void;
}) {
  const initialStart = useMemo(() => {
    const next = new Date();
    next.setMinutes((Math.floor(next.getMinutes() / 30) + 1) * 30, 0, 0);
    return next;
  }, []);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [url, setUrl] = useState(meeting?.meeting_url ?? "");
  const [startsAt, setStartsAt] = useState(meeting ? localDateTime(meeting.starts_at) : localDateTime(initialStart));
  const [endsAt, setEndsAt] = useState(meeting ? localDateTime(meeting.ends_at) : localDateTime(new Date(initialStart.getTime() + 30 * 60_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = meeting?.status === "completed";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || locked) return;
    setError("");
    // Native date pickers can commit their displayed value without React's
    // change event. Submit the actual form values, then sync the draft state.
    const fields = new FormData(event.currentTarget);
    const submittedStart = String(fields.get("starts_at") ?? "");
    const submittedEnd = String(fields.get("ends_at") ?? "");
    setStartsAt(submittedStart);
    setEndsAt(submittedEnd);
    const start = new Date(submittedStart);
    const end = new Date(submittedEnd);
    if (!title.trim()) { setError("Give this meeting a name."); return; }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || localDateTime(start) !== submittedStart || localDateTime(end) !== submittedEnd) {
      setError("Choose a valid start and end time in your local time zone."); return;
    }
    if (end <= start) { setError("The end time must be after the start time."); return; }
    const meetingUrl = safeMeetingUrl(url);
    if (url.trim() && !meetingUrl) { setError("Use a full meeting link starting with https:// or http://, without a username or password."); return; }
    const payload: MeetingInput = { title: title.trim(), agenda: agenda.trim(), meeting_url: meetingUrl ?? "", starts_at: start.toISOString(), ends_at: end.toISOString() };
    setBusy(true);
    try {
      const saved = await apiRequest<Meeting>(meeting ? `${endpoint}/${meeting.id}` : endpoint, { method: meeting ? "PUT" : "POST", body: payload });
      await onSave(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save the meeting. Please try again.");
    } finally { setBusy(false); }
  }

  return <MeetingDialog title={meeting ? "Edit meeting" : "Schedule a meeting"} busy={busy} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="modal-body">
        <p className="meeting-project-label"><CalendarDays size={15} />{project.name}</p>
        <p className="meeting-help">Everyone in this space can see the meeting and add notes or task updates.</p>
        {locked && <p className="meeting-error" role="alert">This meeting is already completed. You can still add notes and task updates from its details.</p>}
        <fieldset disabled={busy || locked}>
          <label>Meeting name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Weekly team catch-up" maxLength={180} required autoFocus /></label>
          <div className="meeting-form-grid">
            <label>Starts<input type="datetime-local" name="starts_at" value={startsAt} onInput={(event) => setStartsAt(event.currentTarget.value)} onChange={(event) => setStartsAt(event.target.value)} onBlur={(event) => setStartsAt(event.currentTarget.value)} required /></label>
            <label>Ends<input type="datetime-local" name="ends_at" value={endsAt} onInput={(event) => setEndsAt(event.currentTarget.value)} onChange={(event) => setEndsAt(event.target.value)} onBlur={(event) => setEndsAt(event.currentTarget.value)} required /></label>
          </div>
          <p className="meeting-timezone"><Clock3 size={13} />Your time zone: {localZone}</p>
          <label>Call link <small>Optional — paste a link from your meeting app.</small><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" maxLength={2000} /></label>
          <label>What will you discuss? <small>Optional — add a short agenda so everyone can prepare.</small><textarea value={agenda} onChange={(event) => setAgenda(event.target.value)} rows={4} maxLength={10000} placeholder="What should we work through together?" /></label>
        </fieldset>
        {error && <p className="meeting-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button><span /><button type="submit" className="btn primary" disabled={busy || locked}>{busy ? <Loader2 size={15} className="meeting-spin" /> : <CalendarDays size={15} />}{busy ? "Saving…" : meeting ? "Save changes" : "Schedule meeting"}</button></footer>
    </form>
  </MeetingDialog>;
}

function UpdateHistory({ updates }: { updates: MeetingTaskUpdate[] }) {
  return <section className="meeting-history" aria-label="Saved task updates">
    <h3><History size={16} />Saved task updates <span>{updates.length}</span></h3>
    <p className="meeting-help">Each change stays in this meeting's history, even if the task changes later.</p>
    {!updates.length ? <p className="meeting-empty-history">No task updates saved yet.</p> : <ol>{[...updates].reverse().map((update) => <li key={update.id}>
      <b>{update.issue_title}</b>
      <div className="meeting-status-change"><span className={`meeting-status status-${update.from_status}`}>{statusNames[update.from_status]}</span><ArrowRight size={13} aria-label="changed to" /><span className={`meeting-status status-${update.to_status}`}>{statusNames[update.to_status]}</span></div>
      <small>{update.user_email} · {dateFormat.format(new Date(update.created_at))}, {timeFormat.format(new Date(update.created_at))}{update.issue_id === null ? " · Task removed" : ""}</small>
    </li>)}</ol>}
  </section>;
}

function ReviewMeeting({ endpoint, meeting, issues, sprints, onSave, onClose }: {
  endpoint: string;
  meeting: Meeting;
  issues: Issue[];
  sprints: Sprint[];
  onSave: (meeting: Meeting, completed: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(meeting.notes);
  const lastSavedNotes = useRef(meeting.notes);
  const [rows, setRows] = useState<{ issueId: number; status: Status | "" }[]>([]);
  const [pickId, setPickId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  useEffect(() => {
    const previous = lastSavedNotes.current;
    lastSavedNotes.current = meeting.notes;
    // Keep notes current while someone is only updating task statuses, without
    // replacing a draft they are actively writing.
    setNotes((current) => current === previous ? meeting.notes : current);
  }, [meeting.notes]);
  const isLocked = (issue: Issue) => !!issue.sprint_id && sprints.some((plan) => plan.id === issue.sprint_id && plan.status === "completed");
  const available = issues.filter((issue) => !isLocked(issue) && !rows.some((row) => row.issueId === issue.id));
  const lockedCount = issues.filter(isLocked).length;
  const changes = rows.flatMap((row) => {
    const issue = issues.find((item) => item.id === row.issueId);
    return issue && !isLocked(issue) && row.status && row.status !== issue.status ? [{ issue_id: row.issueId, status: row.status }] : [];
  });
  const dirty = notes !== meeting.notes || changes.length > 0;

  function addTask() {
    const selected = available.find((issue) => issue.id === Number(pickId));
    if (selected) { setRows((current) => [...current, { issueId: selected.id, status: "" }]); setPickId(""); }
  }

  async function save(complete: boolean) {
    if (busy) return;
    setError("");
    if (rows.some((row) => { const issue = issues.find((item) => item.id === row.issueId); return !issue || isLocked(issue); })) {
      setError("Remove tasks that are no longer available to update, then save again."); return;
    }
    if (rows.some((row) => !row.status)) { setError("Choose a new status for each selected task, or remove it from the list."); return; }
    const payload: MeetingReviewInput = { notes, task_updates: changes, complete };
    setBusy(true);
    setCompleting(complete);
    try {
      const saved = await apiRequest<Meeting>(`${endpoint}/${meeting.id}/review`, { method: "POST", body: payload });
      await onSave(saved, complete);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save your updates. Please try again.");
    } finally { setBusy(false); setCompleting(false); }
  }

  return <MeetingDialog title={meeting.title} busy={busy} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      <div className="modal-body">
        <div className="meeting-detail-meta"><span className={`meeting-status ${meeting.status === "completed" ? "status-completed" : "status-scheduled"}`}>{meeting.status === "completed" ? "Completed" : "Upcoming"}</span><MeetingLink value={meeting.meeting_url} /></div>
        <p className="meeting-detail-time"><CalendarDays size={15} />{meetingTime(meeting)}</p>
        <p className="meeting-timezone">Your time zone: {localZone}</p>
        {meeting.agenda && <div className="meeting-agenda"><h3>Agenda</h3><p>{meeting.agenda}</p></div>}
        <fieldset disabled={busy}>
          <label>Meeting notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={20000} placeholder="What did you decide? What happens next?" /><small>Shared with everyone in this space. You can come back and add more later.</small></label>
          <section className="meeting-task-editor" aria-label="Update project tasks">
            <h3>Update project tasks</h3>
            <p className="meeting-help">Choose the tasks you discussed, then update where things stand.</p>
            {issues.length === 0 ? <p className="meeting-empty-history">There are no tasks in this project yet. You can still save notes or complete the meeting.</p> : <>
              <div className="meeting-task-picker"><label className="meeting-picker-label">Task<select value={pickId} onChange={(event) => setPickId(event.target.value)} disabled={!available.length}><option value="">{available.length ? "Choose a task…" : "No more tasks available"}</option>{available.map((issue) => <option key={issue.id} value={issue.id}>{issue.title} · {statusNames[issue.status]}</option>)}</select></label><button type="button" className="btn secondary" onClick={addTask} disabled={!pickId}><Plus size={15} />Add</button></div>
              {!!lockedCount && <p className="meeting-help meeting-locked-note">{lockedCount} {lockedCount === 1 ? "task is" : "tasks are"} in finished work plans and can't be changed here.</p>}
              <div className="meeting-task-rows">{rows.map((row) => {
                const issue = issues.find((item) => item.id === row.issueId);
                const locked = !issue || isLocked(issue);
                return <div className="meeting-task-row" key={row.issueId}>
                  <div className="meeting-task-summary"><b>{issue?.title ?? "This task is no longer available"}</b>{issue && <small>Currently: {statusNames[issue.status]}</small>}{locked && <small className="meeting-inline-error">This task can't be updated. Remove it to continue.</small>}</div>
                  <label>New status<select aria-label={`New status for ${issue?.title ?? "removed task"}`} value={row.status} disabled={locked} onChange={(event) => setRows((current) => current.map((item) => item.issueId === row.issueId ? { ...item, status: event.target.value as Status | "" } : item))}><option value="">Choose status…</option>{statuses.map((status) => <option key={status} value={status}>{statusNames[status]}</option>)}</select></label>
                  <button type="button" className="icon-btn" onClick={() => setRows((current) => current.filter((item) => item.issueId !== row.issueId))} aria-label={`Remove ${issue?.title ?? "task"} from these updates`}><X size={17} /></button>
                  {row.status === "backlog" && issue?.sprint_id && <p className="meeting-help meeting-later-note">Moving this task to Later also removes it from its work plan.</p>}
                </div>;
              })}</div>
            </>}
          </section>
        </fieldset>
        {meeting.status === "scheduled" && <p className="meeting-complete-note"><CheckCheck size={16} />Marking the meeting completed saves your notes and task changes together. You can still add updates afterward.</p>}
        {error && <p className="meeting-error" role="alert">{error}</p>}
        <UpdateHistory updates={meeting.task_updates} />
      </div>
      <footer><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Close</button><span /><button type="submit" className="btn secondary" disabled={busy || !dirty}>{busy && !completing && <Loader2 size={15} className="meeting-spin" />}{busy && !completing ? "Saving…" : "Save updates"}</button>{meeting.status === "scheduled" && <button type="button" className="btn primary" onClick={() => void save(true)} disabled={busy}>{busy && completing ? <Loader2 size={15} className="meeting-spin" /> : <CheckCheck size={15} />}{busy && completing ? "Saving…" : "Save & mark completed"}</button>}</footer>
    </form>
  </MeetingDialog>;
}

// Reset draft dialogs and tabs when the selected project changes.
export default function ProjectMeetings(props: Props) {
  return <ProjectMeetingsView key={`${props.teamId}:${props.project.id}`} {...props} />;
}

function ProjectMeetingsView({ teamId, project, issues, sprints, onChange }: Props) {
  const queryClient = useQueryClient();
  const endpoint = `/teams/${teamId}/projects/${project.id}/meetings`;
  const queryKey = ["meetings", teamId, project.id];
  const meetings = useQuery({ queryKey, queryFn: () => apiRequest<Meeting[]>(endpoint), refetchInterval: 15000, retry: false });
  const [tab, setTab] = useState<"scheduled" | "completed">("scheduled");
  const [dialog, setDialog] = useState<{ type: "schedule"; meetingId?: number } | { type: "review"; meetingId: number } | null>(null);
  const [notice, setNotice] = useState("");
  const items = meetings.isError ? [] : meetings.data ?? [];
  const selected = dialog?.meetingId ? items.find((meeting) => meeting.id === dialog.meetingId) : undefined;
  const visible = items.filter((meeting) => meeting.status === tab).sort((a, b) => tab === "scheduled"
    ? new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    : new Date(b.completed_at ?? b.ends_at).getTime() - new Date(a.completed_at ?? a.ends_at).getTime());
  const projectIssues = issues.filter((issue) => issue.project_id === project.id);
  const projectSprints = sprints.filter((plan) => plan.project_id === project.id);

  async function saved(meeting: Meeting, completed = false) {
    queryClient.setQueryData<Meeting[]>(queryKey, (old) => [...(old ?? []).filter((item) => item.id !== meeting.id), meeting]);
    setDialog(null);
    setTab(meeting.status);
    setNotice(completed ? "Meeting completed. Your notes and task updates are saved." : "Meeting saved. Everyone in this space can see the update.");
    void queryClient.invalidateQueries({ queryKey });
    try { await onChange(); }
    catch { setNotice("Meeting saved. Refresh the page to see the latest task board."); }
  }

  return <section className="project-meetings" aria-label={`${project.name} meetings`}>
    <div className="meeting-section-heading"><div><h2>Make time to move work forward.</h2><p>Plan a conversation, capture decisions, and update tasks together.</p></div><button type="button" className="btn primary" onClick={() => { setNotice(""); setDialog({ type: "schedule" }); }}><Plus size={16} />Schedule meeting</button></div>
    <div className="meeting-toolbar"><div className="meeting-tabs" aria-label="Meeting status"><button type="button" className={tab === "scheduled" ? "selected" : ""} onClick={() => setTab("scheduled")} aria-pressed={tab === "scheduled"}><CalendarDays size={15} />Upcoming<span>{items.filter((meeting) => meeting.status === "scheduled").length}</span></button><button type="button" className={tab === "completed" ? "selected" : ""} onClick={() => setTab("completed")} aria-pressed={tab === "completed"}><CheckCheck size={15} />Completed<span>{items.filter((meeting) => meeting.status === "completed").length}</span></button></div><p className="meeting-timezone"><Clock3 size={13} />Times shown in {localZone}</p></div>
    {notice && <p className="meeting-notice" role="status"><Check size={16} />{notice}</p>}
    {meetings.isPending ? <div className="meeting-empty"><Loader2 size={23} className="meeting-spin" /><p>Loading meetings…</p></div> : meetings.isError ? <div className="meeting-empty"><p className="meeting-error" role="alert">{meetings.error instanceof Error ? meetings.error.message : "We couldn't load meetings."}</p><button type="button" className="btn secondary" onClick={() => void meetings.refetch()}>Try again</button></div> : !visible.length ? <div className="meeting-empty"><span className="meeting-empty-icon">{tab === "scheduled" ? <Video size={28} /> : <History size={28} />}</span><h3>{tab === "scheduled" ? "Your next conversation starts here" : "A record of what moved forward"}</h3><p>{tab === "scheduled" ? "Schedule a meeting for this project. Keep the agenda, notes, and task updates in one place." : "Completed meetings appear here, along with their notes and saved task changes."}</p>{tab === "scheduled" && <button type="button" className="btn primary" onClick={() => setDialog({ type: "schedule" })}><Plus size={15} />Schedule a meeting</button>}</div> : <div className="meeting-grid">{visible.map((meeting) => <article className="meeting-card" key={meeting.id}>
      <div className="meeting-card-top"><span className={`meeting-status ${meeting.status === "completed" ? "status-completed" : "status-scheduled"}`}>{meeting.status === "completed" ? "Completed" : "Upcoming"}</span>{meeting.status === "scheduled" && <button type="button" className="icon-btn" onClick={() => setDialog({ type: "schedule", meetingId: meeting.id })} aria-label={`Edit meeting ${meeting.title}`}><Pencil size={16} /></button>}</div>
      <h3>{meeting.title}</h3><p className="meeting-card-time"><CalendarDays size={15} />{meetingTime(meeting)}</p>
      <p className="meeting-card-agenda">{meeting.agenda || "No agenda added yet."}</p>
      {meeting.status === "completed" && <div className="meeting-card-record"><p><FileText size={14} />{meeting.notes || "No meeting notes added yet."}</p><small>{meeting.task_updates.length} saved task {meeting.task_updates.length === 1 ? "update" : "updates"}</small></div>}
      <p className="meeting-organizer">Scheduled by {meeting.created_by_email}</p>
      <div className="meeting-card-actions"><button type="button" className="btn primary" onClick={() => setDialog({ type: "review", meetingId: meeting.id })}><FileText size={15} />Notes & task updates</button><MeetingLink value={meeting.meeting_url} /></div>
    </article>)}</div>}
    {!meetings.isError && dialog?.type === "schedule" && (!dialog.meetingId || selected) && <ScheduleMeeting key={selected?.id ?? "new"} endpoint={endpoint} project={project} meeting={selected} onSave={saved} onClose={() => setDialog(null)} />}
    {!meetings.isError && dialog?.type === "review" && selected && <ReviewMeeting key={selected.id} endpoint={endpoint} meeting={selected} issues={projectIssues} sprints={projectSprints} onSave={saved} onClose={() => setDialog(null)} />}
  </section>;
}
