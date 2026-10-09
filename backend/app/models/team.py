from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    key: Mapped[str] = mapped_column(String(10))
    invite_code: Mapped[str] = mapped_column(String(64), unique=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    invite_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc) + timedelta(days=7))


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("team_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")


class Sprint(Base):
    __tablename__ = "sprints"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    goal: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="planned")
    # Each project can run its own plan; uniqueness also protects concurrent starts.
    active_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), unique=True, nullable=True)
    retrospective: Mapped[str] = mapped_column(Text, default="")


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    sprint_id: Mapped[int | None] = mapped_column(ForeignKey("sprints.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")
    acceptance_criteria: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="backlog")
    priority: Mapped[str] = mapped_column(String(20), default="Medium")
    issue_type: Mapped[str] = mapped_column(String(20), default="Task")
    points: Mapped[int] = mapped_column(default=0)
    label: Mapped[str] = mapped_column(String(60), default="")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class IssueComment(Base):
    __tablename__ = "issue_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Activity(Base):
    __tablename__ = "team_activity"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    agenda: Mapped[str] = mapped_column(Text, default="")
    meeting_url: Mapped[str] = mapped_column(String(2000), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MeetingTaskUpdate(Base):
    __tablename__ = "meeting_task_updates"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id"), index=True)
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id", ondelete="SET NULL"), index=True, nullable=True)
    issue_title: Mapped[str] = mapped_column(String(180))
    from_status: Mapped[str] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    user_email: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
