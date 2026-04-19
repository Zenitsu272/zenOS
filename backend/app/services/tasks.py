from datetime import date, datetime, timezone

from app.models.task import Task


def priority_score(task: Task) -> int:
    base = {"Low": 20, "Medium": 50, "High": 75}.get(task.priority, 40)
    if task.due_date is None:
        return base

    days_until_due = (task.due_date - date.today()).days
    if days_until_due < 0:
        return min(100, base + 30)
    if days_until_due == 0:
        return min(100, base + 20)
    if days_until_due <= 3:
        return min(100, base + 12)
    if days_until_due <= 7:
        return min(100, base + 6)
    return base


def apply_completion(task: Task, completed: bool) -> None:
    task.completed = completed
    if completed:
        task.progress = 100
        task.completed_at = datetime.now(timezone.utc)
    else:
        task.completed_at = None
        if task.progress == 100:
            task.progress = 0


def task_to_read(task: Task) -> dict:
    return {
        "id": task.id,
        "user_id": task.user_id,
        "title": task.title,
        "description": task.description,
        "category_id": task.category_id,
        "subbranch_id": task.subbranch_id,
        "task_type": task.task_type,
        "due_date": task.due_date,
        "priority": task.priority,
        "estimated_hours": task.estimated_hours,
        "progress": task.progress,
        "completed": task.completed,
        "completed_at": task.completed_at,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "category_name": task.category.name if task.category else None,
        "subbranch_name": task.subbranch.name if task.subbranch else None,
        "priority_score": priority_score(task),
    }
