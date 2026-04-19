from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.category import Category
from app.models.subbranch import Subbranch
from app.schemas.subbranch import SubbranchCreate, SubbranchRead, SubbranchUpdate


router = APIRouter(prefix="/subbranches", tags=["subbranches"])


@router.get("/{category_id}", response_model=list[SubbranchRead])
def list_subbranches(category_id: int, db: DbSession, current_user: CurrentUser) -> list[Subbranch]:
    category = db.get(Category, category_id)
    if not category or category.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    return list(
        db.scalars(
            select(Subbranch)
            .where(Subbranch.user_id == current_user.id, Subbranch.category_id == category_id)
            .order_by(Subbranch.created_at)
        )
    )


@router.post("", response_model=SubbranchRead, status_code=status.HTTP_201_CREATED)
def create_subbranch(payload: SubbranchCreate, db: DbSession, current_user: CurrentUser) -> Subbranch:
    category = db.get(Category, payload.category_id)
    if not category or category.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    subbranch = Subbranch(
        name=payload.name.strip(),
        notes=payload.notes,
        category_id=payload.category_id,
        user_id=current_user.id,
    )
    db.add(subbranch)
    db.commit()
    db.refresh(subbranch)
    return subbranch


@router.put("/{subbranch_id}", response_model=SubbranchRead)
def update_subbranch(
    subbranch_id: int, payload: SubbranchUpdate, db: DbSession, current_user: CurrentUser
) -> Subbranch:
    subbranch = db.get(Subbranch, subbranch_id)
    if not subbranch or subbranch.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Subbranch not found")
    subbranch.name = payload.name.strip()
    subbranch.notes = payload.notes
    db.commit()
    db.refresh(subbranch)
    return subbranch


@router.delete("/{subbranch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subbranch(subbranch_id: int, db: DbSession, current_user: CurrentUser) -> None:
    subbranch = db.get(Subbranch, subbranch_id)
    if not subbranch or subbranch.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Subbranch not found")
    db.delete(subbranch)
    db.commit()
