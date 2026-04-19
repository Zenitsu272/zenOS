from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TaskType = Literal["Daily", "Long Term"]
Priority = Literal["Low", "Medium", "High"]


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    category_id: int
    subbranch_id: int
    task_type: TaskType = "Daily"
    due_date: date | None = None
    priority: Priority = "Medium"
    estimated_hours: float = Field(default=1.0, ge=0, le=500)
    progress: int = Field(default=0, ge=0, le=100)
    completed: bool = False

    @field_validator("progress")
    @classmethod
    def clamp_completed_progress(cls, value: int) -> int:
        return max(0, min(100, value))


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    category_id: int | None = None
    subbranch_id: int | None = None
    task_type: TaskType | None = None
    due_date: date | None = None
    priority: Priority | None = None
    estimated_hours: float | None = Field(default=None, ge=0, le=500)
    progress: int | None = Field(default=None, ge=0, le=100)
    completed: bool | None = None


class CompleteRequest(BaseModel):
    completed: bool


class TaskRead(TaskBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    category_name: str | None = None
    subbranch_name: str | None = None
    priority_score: int

    model_config = {"from_attributes": True}
