from pydantic import BaseModel


class CategoryProgress(BaseModel):
    category_id: int
    category_name: str
    total_tasks: int
    completed_tasks: int
    progress: int


class SuggestedTask(BaseModel):
    id: int
    title: str
    category_name: str | None
    subbranch_name: str | None
    due_date: str | None
    priority: str
    priority_score: int


class DashboardStats(BaseModel):
    tasks_completed_today: int
    tasks_pending: int
    overdue_count: int
    streak_days: int
    top_active_category_this_week: str | None
    progress_by_category: list[CategoryProgress]
    suggested_today: list[SuggestedTask]
