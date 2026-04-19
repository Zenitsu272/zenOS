from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, categories, dashboard, subbranches, tasks
from app.core.config import get_settings
from app.db import base  # noqa: F401
from app.db.session import engine
from app.models.base import Base


settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(subbranches.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)


@app.on_event("startup")
def on_startup() -> None:
    if settings.environment == "development":
        Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
