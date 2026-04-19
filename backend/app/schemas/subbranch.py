from datetime import datetime

from pydantic import BaseModel, Field


class SubbranchBase(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    notes: str | None = None


class SubbranchCreate(SubbranchBase):
    category_id: int


class SubbranchUpdate(SubbranchBase):
    pass


class SubbranchRead(SubbranchBase):
    id: int
    user_id: int
    category_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
