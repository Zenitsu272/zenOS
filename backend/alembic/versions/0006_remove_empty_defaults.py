"""Remove only recognizable empty automatically created General projects.

Projects had no seed-origin marker. Match the original descriptions and first
project position, and preserve any space with evidence of a manually created
General project. Never delete referenced projects, including historical plans
and meetings.
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_remove_empty_defaults"
down_revision = "0005_space_meetings"
branch_labels = None
depends_on = None


AUTOMATIC_DESCRIPTIONS = (
    "A place for your team's first tasks.",
    "Your existing tasks and work plans.",
)


def upgrade():
    connection = op.get_bind()
    projects = sa.table(
        "projects", sa.column("id", sa.Integer), sa.column("team_id", sa.Integer),
        sa.column("name", sa.String), sa.column("description", sa.Text),
    )
    activity = sa.table("team_activity", sa.column("team_id", sa.Integer), sa.column("message", sa.String))
    issues = sa.table("issues", sa.column("id", sa.Integer), sa.column("project_id", sa.Integer))
    sprints = sa.table("sprints", sa.column("id", sa.Integer), sa.column("project_id", sa.Integer), sa.column("active_project_id", sa.Integer))
    meetings = sa.table("meetings", sa.column("id", sa.Integer), sa.column("project_id", sa.Integer))

    # Take the original first-project positions before deleting any rows. A later
    # manually created project must never become a candidate after cleanup.
    first_projects = dict(connection.execute(
        sa.select(projects.c.team_id, sa.func.min(projects.c.id)).group_by(projects.c.team_id)
    ).all())
    manual_general_spaces = set(connection.execute(
        sa.select(activity.c.team_id).where(activity.c.message == "created project General")
    ).scalars())
    candidates = connection.execute(sa.select(projects).where(
        projects.c.name == "General", projects.c.description.in_(AUTOMATIC_DESCRIPTIONS)
    )).all()
    for project in candidates:
        if first_projects.get(project.team_id) != project.id or project.team_id in manual_general_spaces:
            continue
        # Deliberately do not filter references by team: even inconsistent old
        # references protect the project and all existing work attached to it.
        if connection.execute(sa.select(issues.c.id).where(issues.c.project_id == project.id).limit(1)).first():
            continue
        if connection.execute(sa.select(sprints.c.id).where(sa.or_(
            sprints.c.project_id == project.id, sprints.c.active_project_id == project.id
        )).limit(1)).first():
            continue
        if connection.execute(sa.select(meetings.c.id).where(meetings.c.project_id == project.id).limit(1)).first():
            continue
        connection.execute(projects.delete().where(projects.c.id == project.id))


def downgrade():
    # Do not reintroduce placeholder projects the user asked to remove. Restore
    # a database backup if the deleted empty placeholders themselves are needed.
    pass
