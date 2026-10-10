from datetime import date, datetime, timezone
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TeamCreate(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)
    key: str = Field(min_length=2, max_length=10, pattern=r"^[A-Z][A-Z0-9]+$")


class TeamUpdate(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)


class JoinTeam(StrictModel):
    code: str = Field(min_length=10, max_length=64)


class ProjectCreate(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)


class SprintCreate(StrictModel):
    project_id: int | None = Field(default=None, gt=0)
    name: str = Field(min_length=1, max_length=100)
    goal: str = Field(default="", max_length=5000)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        return self


class SprintTransition(StrictModel):
    status: Literal["active", "completed"]
    retrospective: str = Field(default="", max_length=10000)


class IssueWrite(StrictModel):
    project_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=10000)
    acceptance_criteria: str = Field(default="", max_length=10000)
    status: Literal["backlog", "scheduled", "ongoing", "review", "completed"] = "backlog"
    priority: Literal["Low", "Medium", "High", "Urgent"] = "Medium"
    issue_type: Literal["Story", "Task", "Bug"] = "Task"
    points: int = Field(default=0, ge=0, le=100)
    label: str = Field(default="", max_length=60)
    assignee_id: int | None = None
    sprint_id: int | None = None
    due_date: date | None = None
    assigned_date: date | None = None


class MoveIssue(StrictModel):
    status: Literal["backlog", "scheduled", "ongoing", "review", "completed"]


class CommentCreate(StrictModel):
    body: str = Field(min_length=1, max_length=5000)


class CsvImport(StrictModel):
    project_id: int | None = Field(default=None, gt=0)
    csv: str = Field(min_length=1, max_length=500000)


class MeetingWrite(StrictModel):
    title: str = Field(min_length=1, max_length=180)
    agenda: str = Field(default="", max_length=10000)
    meeting_url: str = Field(default="", max_length=2000)
    starts_at: AwareDatetime
    ends_at: AwareDatetime

    @field_validator("starts_at", "ends_at", mode="before")
    @classmethod
    def require_iso_datetime(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("Use a date and time with a timezone")
        if isinstance(value, str):
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                raise ValueError("Use an ISO date and time with a timezone")
        return value

    @field_validator("meeting_url")
    @classmethod
    def http_meeting_link(cls, value):
        if value:
            return str(TypeAdapter(HttpUrl).validate_python(value))
        return value

    @model_validator(mode="after")
    def dates(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("The meeting must end after it starts")
        # Persist UTC so SQLite cannot lose the offset while storing datetimes.
        self.starts_at = self.starts_at.astimezone(timezone.utc)
        self.ends_at = self.ends_at.astimezone(timezone.utc)
        return self


class MeetingIssueUpdate(StrictModel):
    issue_id: int = Field(gt=0)
    status: Literal["backlog", "scheduled", "ongoing", "review", "completed"]


class MeetingReview(StrictModel):
    notes: str = Field(max_length=20000)
    task_updates: list[MeetingIssueUpdate] = Field(default_factory=list, max_length=200)
    complete: bool = False

    @model_validator(mode="after")
    def unique_tasks(self):
        ids = [item.issue_id for item in self.task_updates]
        if len(ids) != len(set(ids)):
            raise ValueError("Choose each task only once")
        return self
