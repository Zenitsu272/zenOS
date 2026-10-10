"""Remove empty legacy starter folders without deleting lists or tasks."""
from datetime import timedelta, timezone

from alembic import op
import sqlalchemy as sa

revision = "0009_empty_legacy_folders"
down_revision = "0008_project_memberships"
branch_labels = None
depends_on = None

LEGACY_NAMES = ("Learning", "Projects", "DSA", "Internships / Work", "Internships / Research")


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        # Do not let a concurrent list/task insertion race the emptiness check
        # and then get deleted by the category's cascading foreign keys.
        connection.execute(sa.text("LOCK TABLE categories, subbranches, tasks IN SHARE ROW EXCLUSIVE MODE"))
    categories = sa.table("categories", sa.column("id", sa.Integer), sa.column("user_id", sa.Integer),
                          sa.column("name", sa.String), sa.column("created_at", sa.DateTime(timezone=True)))
    users = sa.table("users", sa.column("id", sa.Integer), sa.column("created_at", sa.DateTime(timezone=True)))
    lists = sa.table("subbranches", sa.column("category_id", sa.Integer))
    tasks = sa.table("tasks", sa.column("category_id", sa.Integer))
    empty = (~sa.exists(sa.select(1).where(lists.c.category_id == categories.c.id)),
             ~sa.exists(sa.select(1).where(tasks.c.category_id == categories.c.id)))
    candidates = connection.execute(sa.select(categories.c.id, categories.c.created_at,
        users.c.created_at.label("registered_at")).join(users, users.c.id == categories.c.user_id)
        .where(categories.c.name.in_(LEGACY_NAMES), *empty)).all()
    removed = 0
    for row in candidates:
        if row.created_at is None or row.registered_at is None:
            continue
        created = row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at
        registered = row.registered_at.replace(tzinfo=timezone.utc) if row.registered_at.tzinfo is None else row.registered_at
        # Old registration seeded folders in the same transaction. Preserve
        # later user-created folders even if their names match a starter name.
        if timedelta(0) <= created - registered <= timedelta(seconds=5):
            result = connection.execute(categories.delete().where(categories.c.id == row.id, *empty))
            removed += result.rowcount
    print(f"Empty legacy folder cleanup: removed {removed} folders; no lists or tasks deleted.")


def downgrade():
    # Removed folders were empty; recreating their old IDs would invent content.
    pass
