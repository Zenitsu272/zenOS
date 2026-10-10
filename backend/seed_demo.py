"""Explicit, local-only sample workspace. Run after migrations; never runs on startup."""
import secrets
from datetime import date, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db import base  # noqa: F401
from app.db.session import SessionLocal
from app.models.team import Activity, Issue, IssueComment, Membership, Project, ProjectMembership, Sprint, Team
from app.models.user import User

if get_settings().environment != "development" or not get_settings().database_url.startswith("sqlite"):
    raise SystemExit("Demo data is available only in development with SQLite.")

with SessionLocal() as db:
    if db.scalar(select(User).where(User.email == "demo@zenos.example.com")):
        print("Demo workspace already exists; no changes made.")
        raise SystemExit(0)
    people = []
    for email in ["demo@zenos.example.com", "maya.chen@example.com", "alex.morgan@example.com", "sam.rivera@example.com"]:
        user = User(email=email, hashed_password=get_password_hash("ZenTeam2026!" if not people else secrets.token_urlsafe(32)))
        db.add(user)
        db.flush()
        people.append(user)
    team = Team(name="Product & Engineering", key="ZEN", owner_id=people[0].id, invite_code=secrets.token_urlsafe(24))
    db.add(team)
    db.flush()
    for i, person in enumerate(people):
        db.add(Membership(team_id=team.id, user_id=person.id, role="admin" if i == 0 else "member"))
    project = Project(team_id=team.id, name="General", description="Build a better team workspace.")
    db.add(project)
    db.flush()
    for person in people:
        db.add(ProjectMembership(project_id=project.id, user_id=person.id))
    today = date.today()
    sprint = Sprint(team_id=team.id, project_id=project.id, name="Sprint 01 · A better workspace", goal="Make teamwork feel effortless — from the first invite to the final delivery.", start_date=today - timedelta(days=4), end_date=today + timedelta(days=9), status="active", active_project_id=project.id)
    db.add(sprint)
    db.flush()
    tasks = [
        ("Design the team onboarding flow", "scheduled", "High", "Story", 5, "Design", 1),
        ("Set up workspace notifications", "scheduled", "Medium", "Task", 3, "Backend", 2),
        ("Write acceptance criteria for invites", "scheduled", "Low", "Task", 2, "Planning", 0),
        ("Build the shared task board", "ongoing", "High", "Story", 8, "Frontend", 0),
        ("Add role-based workspace access", "ongoing", "High", "Task", 5, "Backend", 2),
        ("Create reusable task components", "ongoing", "Medium", "Task", 3, "Design system", 1),
        ("Review sprint planning experience", "review", "Medium", "Story", 5, "Product", 3),
        ("Fix date picker timezone handling", "review", "High", "Bug", 2, "Frontend", 2),
        ("Define the workspace design system", "completed", "High", "Story", 5, "Design", 1),
        ("Set up the project repository", "completed", "Medium", "Task", 2, "Development", 0),
        ("Map the team's agile workflow", "completed", "Low", "Task", 3, "Planning", 3),
        ("Explore calendar integration", "backlog", "Low", "Story", 8, "Discovery", 3),
        ("Add task dependencies", "backlog", "Medium", "Story", 5, "Product", 0),
        ("Improve keyboard navigation", "backlog", "High", "Task", 3, "Accessibility", 1),
    ]
    for title, status, priority, kind, points, label, owner in tasks:
        issue = Issue(team_id=team.id, project_id=project.id, reporter_id=people[0].id, assignee_id=people[owner].id, sprint_id=None if status == "backlog" else sprint.id, title=title, description=f"Sample task for the zenOS team workspace. Collaborate with the team to {title.lower()}.", acceptance_criteria="Works across desktop and mobile.\nReviewed by a teammate.\nMeets the agreed requirements.", status=status, priority=priority, issue_type=kind, points=points, label=label, due_date=today + timedelta(days=5))
        db.add(issue)
        db.flush()
        if status == "review":
            db.add(IssueComment(issue_id=issue.id, user_id=people[owner].id, body="Ready for a second pair of eyes. Acceptance criteria are covered."))
    db.add(Activity(team_id=team.id, user_id=people[0].id, message="started Sprint 01 · A better workspace"))
    db.add(Activity(team_id=team.id, user_id=people[1].id, message="completed Define the workspace design system"))
    db.add(Activity(team_id=team.id, user_id=people[2].id, message="moved Fix date picker timezone handling to review"))
    db.commit()
    print("Local demo ready: demo@zenos.example.com / ZenTeam2026!")
