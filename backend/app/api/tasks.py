from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models.category import Category
from app.models.subbranch import Subbranch
from app.models.task import Task
from app.schemas.task import CompleteRequest, TaskCreate, TaskRead, TaskUpdate
from app.services.tasks import apply_completion, task_to_read


router = APIRouter(prefix="/tasks", tags=["tasks"])


def _assert_task_scope(db: DbSession, user_id: int, category_id: int, subbranch_id: int) -> None:
    category = db.get(Category, category_id)
    subbranch = db.get(Subbranch, subbranch_id)
    if not category or category.user_id != user_id:
        raise HTTPException(status_code=404, detail="Category not found")
    if not subbranch or subbranch.user_id != user_id or subbranch.category_id != category_id:
        raise HTTPException(status_code=400, detail="Subbranch does not belong to this category")


@router.get("", response_model=list[TaskRead])
def list_tasks(
    db: DbSession,
    current_user: CurrentUser,
    category_id: int | None = None,
    subbranch_id: int | None = None,
    task_type: str | None = Query(default=None, pattern="^(Daily|Long Term)$"),
    completed: bool | None = None,
    priority: str | None = Query(default=None, pattern="^(Low|Medium|High)$"),
    search: str | None = None,
) -> list[dict]:
    statement = (
        select(Task)
        .where(Task.user_id == current_user.id)
        .options(selectinload(Task.category), selectinload(Task.subbranch))
        .order_by(Task.completed, Task.due_date.is_(None), Task.due_date, Task.created_at.desc())
    )
    if category_id is not None:
        statement = statement.where(Task.category_id == category_id)
    if subbranch_id is not None:
        statement = statement.where(Task.subbranch_id == subbranch_id)
    if task_type is not None:
        statement = statement.where(Task.task_type == task_type)
    if completed is not None:
        statement = statement.where(Task.completed == completed)
    if priority is not None:
        statement = statement.where(Task.priority == priority)
    if search:
        search_term = f"%{search.strip()}%"
        statement = statement.where(or_(Task.title.ilike(search_term), Task.description.ilike(search_term)))

    tasks = db.scalars(statement).all()
    return [task_to_read(task) for task in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, current_user: CurrentUser) -> dict:
    _assert_task_scope(db, current_user.id, payload.category_id, payload.subbranch_id)
    task = Task(**payload.model_dump(), user_id=current_user.id)
    if task.completed:
        task.progress = 100
        task.completed_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()
    db.refresh(task)
    task = db.scalar(
        select(Task)
        .where(Task.id == task.id)
        .options(selectinload(Task.category), selectinload(Task.subbranch))
    )
    return task_to_read(task)


@router.put("/{task_id}", response_model=TaskRead)
def update_task(task_id: int, payload: TaskUpdate, db: DbSession, current_user: CurrentUser) -> dict:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id, Task.user_id == current_user.id)
        .options(selectinload(Task.category), selectinload(Task.subbranch))
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = payload.model_dump(exclude_unset=True)
    next_category_id = updates.get("category_id", task.category_id)
    next_subbranch_id = updates.get("subbranch_id", task.subbranch_id)
    if "category_id" in updates or "subbranch_id" in updates:
        _assert_task_scope(db, current_user.id, next_category_id, next_subbranch_id)

    completed_value = updates.pop("completed", None)
    for key, value in updates.items():
        setattr(task, key, value)
    if completed_value is not None:
        apply_completion(task, completed_value)
    elif task.progress == 100:
        apply_completion(task, True)
    elif task.completed and task.progress < 100:
        task.completed = False
        task.completed_at = None

    db.commit()
    db.refresh(task)
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.category), selectinload(Task.subbranch))
    )
    return task_to_read(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()


@router.patch("/{task_id}/complete", response_model=TaskRead)
def complete_task(
    task_id: int, payload: CompleteRequest, db: DbSession, current_user: CurrentUser
) -> dict:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id, Task.user_id == current_user.id)
        .options(selectinload(Task.category), selectinload(Task.subbranch))
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    apply_completion(task, payload.completed)
    db.commit()
    db.refresh(task)
    return task_to_read(task)
