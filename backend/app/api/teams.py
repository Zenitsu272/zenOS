import csv
import io
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.models.team import Activity, Issue, IssueComment, Meeting, MeetingTaskUpdate, Membership, Project, Sprint, Team
from app.models.user import User
from app.schemas.team import CommentCreate, CsvImport, IssueWrite, JoinTeam, MeetingReview, MeetingWrite, MoveIssue, ProjectCreate, SprintCreate, SprintTransition, TeamCreate, TeamUpdate

router = APIRouter(prefix="/teams", tags=["teams"])


def membership(db, team_id, user_id, admin=False):
    member = db.scalar(select(Membership).where(Membership.team_id == team_id, Membership.user_id == user_id))
    if not member:
        raise HTTPException(404, "Space not found")
    if admin and db.get(Team, team_id).owner_id != user_id:
        raise HTTPException(403, "Only the space owner can manage space settings, projects, work plans, and members")
    return member


def log(db, team_id, user_id, message):
    db.add(Activity(team_id=team_id, user_id=user_id, message=message))


def team_read(team, member):
    is_owner = team.owner_id == member.user_id
    return {"id": team.id, "name": team.name, "description": team.description, "key": team.key, "owner_id": team.owner_id,
            "role": "admin" if is_owner else "member",
            "invite_code": team.invite_code if is_owner else None,
            "invite_expires_at": utc_expiry(team) if is_owner else None}


def utc_datetime(value):
    # SQLite removes timezone information; stored timestamps always represent UTC.
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def utc_expiry(team):
    return utc_datetime(team.invite_expires_at)


def find_invite(db, code, lock=False):
    query = select(Team).where(Team.invite_code == code)
    team = db.scalar(query.with_for_update() if lock else query)
    if not team:
        raise HTTPException(404, "This invite link is invalid. Ask the space owner for a new link")
    if utc_expiry(team) <= datetime.now(timezone.utc):
        raise HTTPException(410, "This invite link has expired. Ask the space owner for a new link")
    return team


def renew_invite(team):
    team.invite_code = secrets.token_urlsafe(24)
    team.invite_expires_at = datetime.now(timezone.utc) + timedelta(days=7)


def resolve_project(db, team_id, project_id=None):
    if project_id is None:
        project = db.scalar(select(Project).where(Project.team_id == team_id).order_by(Project.id))
        if project is None:
            raise HTTPException(422, "Create a project in this space before adding tasks or work plans")
    else:
        project = db.get(Project, project_id)
    if not project or project.team_id != team_id:
        raise HTTPException(422, "Choose a project from this space")
    return project


def get_issue(db, team_id, issue_id):
    issue = db.get(Issue, issue_id)
    if not issue or issue.team_id != team_id:
        raise HTTPException(404, "Task not found")
    return issue


def get_project(db, team_id, project_id):
    project = db.get(Project, project_id)
    if not project or project.team_id != team_id:
        raise HTTPException(404, "Project not found")
    return project


def get_meeting(db, team_id, project_id, meeting_id, lock=False):
    query = select(Meeting).where(Meeting.id == meeting_id, Meeting.team_id == team_id, Meeting.project_id == project_id)
    meeting = db.scalar(query.with_for_update() if lock else query)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


def meeting_read(db, meeting, creator_email=None, task_updates=None):
    if creator_email is None:
        creator_email = db.scalar(select(User.email).where(User.id == meeting.created_by))
    if task_updates is None:
        task_updates = list(db.scalars(select(MeetingTaskUpdate).where(MeetingTaskUpdate.meeting_id == meeting.id).order_by(MeetingTaskUpdate.id)))
    return {
        "id": meeting.id, "team_id": meeting.team_id, "project_id": meeting.project_id,
        "title": meeting.title, "agenda": meeting.agenda, "meeting_url": meeting.meeting_url,
        "starts_at": utc_datetime(meeting.starts_at), "ends_at": utc_datetime(meeting.ends_at),
        "status": meeting.status, "notes": meeting.notes,
        "created_by": meeting.created_by, "created_by_email": creator_email,
        "completed_at": utc_datetime(meeting.completed_at),
        "task_updates": [
            {"id": item.id, "issue_id": item.issue_id, "issue_title": item.issue_title,
             "from_status": item.from_status, "to_status": item.to_status,
             "user_email": item.user_email, "created_at": utc_datetime(item.created_at)}
            for item in task_updates
        ],
    }


def validate_relations(db, team_id, payload, existing=None):
    project_id = existing.project_id if existing and payload.project_id is None else payload.project_id
    project = resolve_project(db, team_id, project_id)
    if existing and project.id != existing.project_id:
        raise HTTPException(422, "A task must stay in its original project")
    if payload.assignee_id is not None:
        if not db.scalar(select(Membership).where(Membership.team_id == team_id, Membership.user_id == payload.assignee_id)):
            raise HTTPException(422, "Choose someone who belongs to this space")
    if payload.sprint_id is not None:
        sprint = db.get(Sprint, payload.sprint_id)
        if not sprint or sprint.team_id != team_id or sprint.project_id != project.id:
            raise HTTPException(422, "Choose a work plan from this project")
        if sprint.status == "completed":
            raise HTTPException(409, "This plan is finished. Add a new task for any follow-up work")
    if payload.status == "backlog" and payload.sprint_id is not None:
        raise HTTPException(422, "Tasks saved for Later cannot be in a work plan. Move the task to To do first")
    if existing and existing.sprint_id:
        if db.get(Sprint, existing.sprint_id).status == "completed":
            raise HTTPException(409, "This plan is finished, so its tasks are saved as a record")
    return project.id


@router.get("")
def list_teams(db: DbSession, user: CurrentUser):
    rows = db.execute(select(Team, Membership).join(Membership, Team.id == Membership.team_id).where(Membership.user_id == user.id)).all()
    return [team_read(team, member) for team, member in rows]


@router.post("", status_code=201)
def create_team(payload: TeamCreate, db: DbSession, user: CurrentUser):
    team = Team(**payload.model_dump(), owner_id=user.id)
    renew_invite(team)
    db.add(team)
    db.flush()
    member = Membership(team_id=team.id, user_id=user.id, role="admin")
    db.add(member)
    log(db, team.id, user.id, "created the space")
    db.commit()
    return team_read(team, member)


@router.put("/{team_id}")
def update_team(team_id: int, payload: TeamUpdate, db: DbSession, user: CurrentUser):
    member = membership(db, team_id, user.id, admin=True)
    team = db.get(Team, team_id)
    team.name = payload.name
    team.description = payload.description
    log(db, team_id, user.id, "updated the space settings")
    db.commit()
    return team_read(team, member)


@router.get("/invites/{code}")
def preview_invite(code: str, db: DbSession):
    team = find_invite(db, code)
    return {"id": team.id, "name": team.name, "invite_expires_at": utc_expiry(team)}


@router.post("/join")
def join_team(payload: JoinTeam, db: DbSession, user: CurrentUser):
    team = find_invite(db, payload.code, lock=True)
    member = db.scalar(select(Membership).where(Membership.team_id == team.id, Membership.user_id == user.id))
    if not member:
        member = Membership(team_id=team.id, user_id=user.id, role="member")
        db.add(member)
        log(db, team.id, user.id, "joined the space")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            member = membership(db, team.id, user.id)
    return team_read(team, member)


@router.post("/{team_id}/rotate-invite")
def rotate_invite(team_id: int, db: DbSession, user: CurrentUser):
    member = membership(db, team_id, user.id, admin=True)
    team = db.scalar(select(Team).where(Team.id == team_id).with_for_update())
    renew_invite(team)
    db.commit()
    return team_read(team, member)


@router.post("/{team_id}/projects", status_code=201)
def create_project(team_id: int, payload: ProjectCreate, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id, admin=True)
    project = Project(team_id=team_id, **payload.model_dump())
    db.add(project)
    log(db, team_id, user.id, f"created project {payload.name}")
    db.commit()
    db.refresh(project)
    return project


@router.get("/{team_id}/projects/{project_id}/meetings")
def list_meetings(team_id: int, project_id: int, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    get_project(db, team_id, project_id)
    rows = db.execute(
        select(Meeting, User.email).join(User, User.id == Meeting.created_by)
        .where(Meeting.team_id == team_id, Meeting.project_id == project_id)
        .order_by(
            case((Meeting.status == "scheduled", 0), else_=1),
            case((Meeting.status == "scheduled", Meeting.starts_at)).asc(),
            Meeting.completed_at.desc(), Meeting.id,
        )
    ).all()
    history = {}
    if rows:
        ids = [meeting.id for meeting, email in rows]
        for item in db.scalars(select(MeetingTaskUpdate).where(MeetingTaskUpdate.meeting_id.in_(ids)).order_by(MeetingTaskUpdate.id)):
            history.setdefault(item.meeting_id, []).append(item)
    return [meeting_read(db, meeting, email, history.get(meeting.id, [])) for meeting, email in rows]


@router.post("/{team_id}/projects/{project_id}/meetings", status_code=201)
def create_meeting(team_id: int, project_id: int, payload: MeetingWrite, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    get_project(db, team_id, project_id)
    meeting = Meeting(team_id=team_id, project_id=project_id, created_by=user.id, **payload.model_dump())
    db.add(meeting)
    log(db, team_id, user.id, f"scheduled meeting {payload.title}")
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, meeting)


@router.put("/{team_id}/projects/{project_id}/meetings/{meeting_id}")
def update_meeting(team_id: int, project_id: int, meeting_id: int, payload: MeetingWrite, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    get_project(db, team_id, project_id)
    meeting = get_meeting(db, team_id, project_id, meeting_id, lock=True)
    if meeting.status == "completed":
        raise HTTPException(409, "This meeting is finished. You can still update its notes and review tasks")
    for key, value in payload.model_dump().items():
        setattr(meeting, key, value)
    log(db, team_id, user.id, f"updated meeting {meeting.title}")
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, meeting)


@router.post("/{team_id}/projects/{project_id}/meetings/{meeting_id}/review")
def review_meeting(team_id: int, project_id: int, meeting_id: int, payload: MeetingReview, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    get_project(db, team_id, project_id)
    meeting = get_meeting(db, team_id, project_id, meeting_id, lock=True)
    issue_ids = [item.issue_id for item in payload.task_updates]
    issues = {}
    if issue_ids:
        # Lock plans before tasks, matching plan completion's lock order. A plan
        # cannot finish halfway through a review and invalidate its task changes.
        plans = {plan.id: plan for plan in db.scalars(
            select(Sprint).where(Sprint.team_id == team_id, Sprint.project_id == project_id)
            .order_by(Sprint.id).with_for_update()
        )}
        issues = {issue.id: issue for issue in db.scalars(
            select(Issue).where(Issue.id.in_(issue_ids), Issue.team_id == team_id, Issue.project_id == project_id)
            .order_by(Issue.id).with_for_update()
        )}
        if len(issues) != len(issue_ids):
            raise HTTPException(422, "Choose tasks from this meeting's project")
        for issue in issues.values():
            if issue.sprint_id:
                plan = plans.get(issue.sprint_id)
                if not plan or plan.status == "completed":
                    raise HTTPException(409, "A selected task belongs to a finished work plan and is saved as a record")
    # All rows are validated before changing notes, completion, tasks, or history.
    meeting.notes = payload.notes
    for change in payload.task_updates:
        issue = issues[change.issue_id]
        if issue.status == change.status:
            continue
        db.add(MeetingTaskUpdate(
            meeting_id=meeting.id, issue_id=issue.id, issue_title=issue.title,
            from_status=issue.status, to_status=change.status, user_email=user.email,
        ))
        issue.status = change.status
        if change.status == "backlog":
            issue.sprint_id = None
    if payload.complete and meeting.status != "completed":
        meeting.status = "completed"
        meeting.completed_at = datetime.now(timezone.utc)
    log(db, team_id, user.id, f"reviewed meeting {meeting.title}")
    db.commit()
    db.refresh(meeting)
    return meeting_read(db, meeting)


@router.delete("/{team_id}/members/{user_id}", status_code=204)
def remove_member(team_id: int, user_id: int, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id, admin=True)
    team = db.scalar(select(Team).where(Team.id == team_id).with_for_update())
    if team.owner_id == user_id:
        raise HTTPException(409, "The space owner cannot be removed")
    member = membership(db, team_id, user_id)
    for issue in db.scalars(select(Issue).where(Issue.team_id == team_id, Issue.assignee_id == user_id, Issue.status != "completed")):
        issue.assignee_id = None
    removed_user = db.get(User, user_id)
    log(db, team_id, user.id, f"removed {removed_user.email} from the space")
    db.delete(member)
    # Old shared links must not let a removed member immediately rejoin.
    renew_invite(team)
    db.commit()


@router.get("/{team_id}/workspace")
def workspace(team_id: int, db: DbSession, user: CurrentUser):
    member = membership(db, team_id, user.id)
    team = db.get(Team, team_id)
    people = db.execute(select(User, Membership).join(Membership, User.id == Membership.user_id).where(Membership.team_id == team_id)).all()
    comments = db.execute(select(IssueComment, User.email).join(User, User.id == IssueComment.user_id).join(Issue, Issue.id == IssueComment.issue_id).where(Issue.team_id == team_id).order_by(IssueComment.id)).all()
    activity = db.execute(select(Activity, User.email).join(User, User.id == Activity.user_id).where(Activity.team_id == team_id).order_by(Activity.id.desc()).limit(30)).all()
    return {
        "team": team_read(team, member),
        "projects": list(db.scalars(select(Project).where(Project.team_id == team_id).order_by(Project.id))),
        "members": [{"id": u.id, "email": u.email, "role": "admin" if team.owner_id == u.id else "member"} for u, m in people],
        "sprints": list(db.scalars(select(Sprint).where(Sprint.team_id == team_id).order_by(Sprint.id))),
        "issues": list(db.scalars(select(Issue).where(Issue.team_id == team_id).order_by(Issue.id))),
        "comments": [{"id": c.id, "issue_id": c.issue_id, "email": email, "body": c.body, "created_at": c.created_at} for c, email in comments],
        "activity": [{"id": a.id, "email": email, "message": a.message, "created_at": a.created_at} for a, email in activity],
    }


@router.post("/{team_id}/sprints", status_code=201)
def create_sprint(team_id: int, payload: SprintCreate, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id, admin=True)
    project = resolve_project(db, team_id, payload.project_id)
    sprint = Sprint(team_id=team_id, **{**payload.model_dump(), "project_id": project.id})
    db.add(sprint)
    log(db, team_id, user.id, f"planned {payload.name}")
    db.commit()
    db.refresh(sprint)
    return sprint


@router.patch("/{team_id}/sprints/{sprint_id}")
def transition_sprint(team_id: int, sprint_id: int, payload: SprintTransition, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id, admin=True)
    sprint = db.scalar(select(Sprint).where(Sprint.id == sprint_id, Sprint.team_id == team_id).with_for_update())
    if not sprint:
        raise HTTPException(404, "Work plan not found")
    if payload.status == "active":
        if sprint.status != "planned":
            raise HTTPException(409, "This plan has already been started or finished")
        if db.scalar(select(Sprint).where(Sprint.active_project_id == sprint.project_id)):
            raise HTTPException(409, "Finish this project's current plan before starting another")
        sprint.active_project_id = sprint.project_id
    else:
        if sprint.status != "active":
            raise HTTPException(409, "Start this plan before finishing it")
        # Preserve delivered work and return unfinished work to the backlog for replanning.
        for issue in db.scalars(select(Issue).where(Issue.sprint_id == sprint_id, Issue.status != "completed")):
            issue.sprint_id = None
            issue.status = "backlog"
        sprint.active_project_id = None
        sprint.retrospective = payload.retrospective
    sprint.status = payload.status
    log(db, team_id, user.id, f"{'started' if payload.status == 'active' else 'completed'} {sprint.name}")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Another work plan is already in progress for this project")
    db.refresh(sprint)
    return sprint


@router.post("/{team_id}/issues", status_code=201)
def create_issue(team_id: int, payload: IssueWrite, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    project_id = validate_relations(db, team_id, payload)
    issue = Issue(team_id=team_id, reporter_id=user.id, **{**payload.model_dump(), "project_id": project_id})
    db.add(issue)
    log(db, team_id, user.id, f"created {payload.title}")
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/{team_id}/issues/{issue_id}")
def update_issue(team_id: int, issue_id: int, payload: IssueWrite, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    issue = get_issue(db, team_id, issue_id)
    project_id = validate_relations(db, team_id, payload, issue)
    for key, value in {**payload.model_dump(), "project_id": project_id}.items():
        setattr(issue, key, value)
    log(db, team_id, user.id, f"updated {issue.title}")
    db.commit()
    db.refresh(issue)
    return issue


@router.patch("/{team_id}/issues/{issue_id}/status")
def move_issue(team_id: int, issue_id: int, payload: MoveIssue, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    issue = get_issue(db, team_id, issue_id)
    if issue.sprint_id and db.get(Sprint, issue.sprint_id).status == "completed":
        raise HTTPException(409, "This plan is finished, so its tasks are saved as a record")
    issue.status = payload.status
    if payload.status == "backlog":
        issue.sprint_id = None
    log(db, team_id, user.id, f"moved {issue.title} to {payload.status}")
    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{team_id}/issues/{issue_id}", status_code=204)
def delete_issue(team_id: int, issue_id: int, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    issue = get_issue(db, team_id, issue_id)
    if issue.sprint_id and db.get(Sprint, issue.sprint_id).status == "completed":
        raise HTTPException(409, "This plan is finished, so its tasks are saved as a record")
    for comment in db.scalars(select(IssueComment).where(IssueComment.issue_id == issue.id)):
        db.delete(comment)
    # Keep review snapshots even on SQLite connections without FK enforcement.
    db.execute(update(MeetingTaskUpdate).where(MeetingTaskUpdate.issue_id == issue.id).values(issue_id=None))
    db.flush()
    log(db, team_id, user.id, f"deleted {issue.title}")
    db.delete(issue)
    db.commit()


@router.post("/{team_id}/issues/{issue_id}/comments", status_code=201)
def comment(team_id: int, issue_id: int, payload: CommentCreate, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    issue = get_issue(db, team_id, issue_id)
    db.add(IssueComment(issue_id=issue.id, user_id=user.id, body=payload.body))
    log(db, team_id, user.id, f"commented on {issue.title}")
    db.commit()
    return {"ok": True}


@router.post("/{team_id}/import", status_code=201)
def import_csv(team_id: int, payload: CsvImport, db: DbSession, user: CurrentUser):
    membership(db, team_id, user.id)
    project = resolve_project(db, team_id, payload.project_id)
    reader = csv.DictReader(io.StringIO(payload.csv.lstrip("\ufeff")))
    aliases = {"task": "title", "notes": "description", "due date": "due_date", "group": "label"}
    if reader.fieldnames:
        reader.fieldnames = [aliases.get(name.strip().lower(), name.strip().lower()) for name in reader.fieldnames]
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise HTTPException(422, "Each column needs a different name")
    allowed = {"title", "description", "status", "priority", "issue_type", "points", "label", "due_date", "acceptance_criteria"}
    if not reader.fieldnames or "title" not in reader.fieldnames or set(reader.fieldnames) - allowed:
        raise HTTPException(422, "CSV needs a title column. Supported columns: " + ", ".join(sorted(allowed)))
    rows = []
    try:
        for index, row in enumerate(reader, start=2):
            if index > 201:
                raise HTTPException(422, "Import up to 200 tasks at a time")
            if None in row:
                raise HTTPException(422, f"CSV row {index} has too many columns")
            values = {k: v.strip() for k, v in row.items() if v and v.strip()}
            statuses = {"to do": "scheduled", "todo": "scheduled", "doing": "ongoing", "done": "completed", "later": "backlog", "needs a check": "review"}
            if "status" in values:
                values["status"] = statuses.get(values["status"].lower(), values["status"].lower())
            if "priority" in values:
                values["priority"] = values["priority"].capitalize()
            if "issue_type" in values:
                values["issue_type"] = values["issue_type"].capitalize()
            values.setdefault("status", "scheduled")
            rows.append(IssueWrite(**values))
    except (ValidationError, csv.Error) as exc:
        raise HTTPException(422, f"CSV row {index}: {str(exc)}")
    if not rows:
        raise HTTPException(422, "CSV contains no tasks")
    for row in rows:
        db.add(Issue(team_id=team_id, reporter_id=user.id, **{**row.model_dump(), "project_id": project.id}))
    log(db, team_id, user.id, f"imported {len(rows)} tasks from CSV")
    db.commit()
    return {"imported": len(rows)}
