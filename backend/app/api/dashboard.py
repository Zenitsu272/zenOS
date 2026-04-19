from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models.category import Category
from app.models.task import Task
from app.schemas.dashboard import CategoryProgress, DashboardStats, SuggestedTask
from app.services.tasks import priority_score


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(db: DbSession, current_user: CurrentUser) -> DashboardStats:
    today = date.today()
    week_start = today - timedelta(days=7)

    categories = list(
        db.scalars(select(Category).where(Category.user_id == current_user.id).order_by(Category.created_at))
    )
    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == current_user.id)
            .options(selectinload(Task.category), selectinload(Task.subbranch))
        )
    )

    pending = [task for task in tasks if not task.completed]
    completed_today = [
        task for task in tasks if task.completed_at and task.completed_at.date() == today
    ]
    overdue = [
        task for task in pending if task.due_date is not None and task.due_date < today
    ]

    progress_by_category: list[CategoryProgress] = []
    for category in categories:
        category_tasks = [task for task in tasks if task.category_id == category.id]
        completed_count = len([task for task in category_tasks if task.completed])
        total_count = len(category_tasks)
        progress = round((completed_count / total_count) * 100) if total_count else 0
        progress_by_category.append(
            CategoryProgress(
                category_id=category.id,
                category_name=category.name,
                total_tasks=total_count,
                completed_tasks=completed_count,
                progress=progress,
            )
        )

    streak_days = 0
    cursor = today
    while True:
        has_completed_daily = any(
            task.task_type == "Daily"
            and task.completed_at is not None
            and task.completed_at.date() == cursor
            for task in tasks
        )
        if not has_completed_daily:
            break
        streak_days += 1
        cursor -= timedelta(days=1)

    active_counter: Counter[str] = Counter()
    for task in tasks:
        task_day = task.updated_at.date() if task.updated_at else None
        if task.category and task_day and task_day >= week_start:
            active_counter[task.category.name] += 1
    top_category = active_counter.most_common(1)[0][0] if active_counter else None

    suggested = sorted(pending, key=priority_score, reverse=True)[:5]
    suggested_today = [
        SuggestedTask(
            id=task.id,
            title=task.title,
            category_name=task.category.name if task.category else None,
            subbranch_name=task.subbranch.name if task.subbranch else None,
            due_date=task.due_date.isoformat() if task.due_date else None,
            priority=task.priority,
            priority_score=priority_score(task),
        )
        for task in suggested
    ]

    return DashboardStats(
        tasks_completed_today=len(completed_today),
        tasks_pending=len(pending),
        overdue_count=len(overdue),
        streak_days=streak_days,
        top_active_category_this_week=top_category,
        progress_by_category=progress_by_category,
        suggested_today=suggested_today,
    )
