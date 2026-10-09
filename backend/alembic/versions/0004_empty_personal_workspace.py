"""Remove recognizable untouched starter folders; new accounts now start empty.

The old app did not record seed provenance. Match the complete original tree and
registration timestamps conservatively, and keep anything with user content or
evidence of modification. This data-only cleanup never deletes tasks or team data.
"""
from datetime import timedelta, timezone

from alembic import op
import sqlalchemy as sa


revision = "0004_empty_personal_workspace"
down_revision = "0003_space_projects"
branch_labels = None
depends_on = None

# Snapshot the removed historical starter content in the migration, independent
# of application code. These values are never used to initialize new accounts.
LEGACY_STARTERS = {
    "Internships / Work": {"Company A Internship", "Intel AIoT Club", "Freelance Work", "Research Assistantship"},
    "Learning": {"TensorFlow", "Spring Boot", "MLOps", "Communication Theory"},
    "Projects": {"SheAlert", "Healthcare AI App", "Portfolio Website"},
    "DSA": {"Arrays", "Trees", "Dynamic Programming", "Contest Prep"},
}


def untouched_at_registration(row, registered_at):
    if row.created_at is None or row.updated_at is None or registered_at is None:
        return False
    created = row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at
    updated = row.updated_at.replace(tzinfo=timezone.utc) if row.updated_at.tzinfo is None else row.updated_at
    registered = registered_at.replace(tzinfo=timezone.utc) if registered_at.tzinfo is None else registered_at
    # Normal seeding happened in the registration transaction. Preserve matching
    # trees created later by users, and unusual cases where origin is uncertain.
    return created == updated and timedelta(0) <= created - registered <= timedelta(seconds=5)


def upgrade():
    connection = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Integer), sa.column("created_at", sa.DateTime(timezone=True)))
    categories = sa.table(
        "categories", sa.column("id", sa.Integer), sa.column("user_id", sa.Integer),
        sa.column("name", sa.String), sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    branches = sa.table(
        "subbranches", sa.column("id", sa.Integer), sa.column("user_id", sa.Integer),
        sa.column("category_id", sa.Integer), sa.column("name", sa.String),
        sa.column("notes", sa.Text), sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    tasks = sa.table("tasks", sa.column("id", sa.Integer), sa.column("category_id", sa.Integer), sa.column("subbranch_id", sa.Integer))
    candidates = connection.execute(
        sa.select(categories, users.c.created_at.label("registered_at"))
        .join(users, users.c.id == categories.c.user_id)
        .where(categories.c.name.in_(LEGACY_STARTERS))
    ).all()
    for category in candidates:
        if not untouched_at_registration(category, category.registered_at):
            continue
        children = connection.execute(sa.select(branches).where(branches.c.category_id == category.id)).all()
        expected = LEGACY_STARTERS[category.name]
        if len(children) != len(expected) or {child.name for child in children} != expected:
            continue
        if any(
            child.user_id != category.user_id
            or child.notes not in (None, "")
            or not untouched_at_registration(child, category.registered_at)
            for child in children
        ):
            continue
        child_ids = [child.id for child in children]
        # Check both relations without an owner filter so even inconsistent legacy
        # task references cannot be removed indirectly through a foreign-key cascade.
        has_task = connection.execute(
            sa.select(tasks.c.id).where(sa.or_(tasks.c.category_id == category.id, tasks.c.subbranch_id.in_(child_ids))).limit(1)
        ).first()
        if has_task:
            continue
        connection.execute(branches.delete().where(branches.c.id.in_(child_ids)))
        connection.execute(categories.delete().where(categories.c.id == category.id))


def downgrade():
    # Reintroducing deleted seed rows would invent IDs and restore content the
    # user asked to remove. A pre-migration database backup is the recovery path.
    pass
