"""Organize the existing Intel IoT Club projects into wings."""
from alembic import op
import sqlalchemy as sa

revision = "0011_club_project_wings"
down_revision = "0010_issue_assigned_date"
branch_labels = None
depends_on = None


def upgrade():
    teams = sa.table("teams", sa.column("id"), sa.column("name"), sa.column("wings_enabled"))
    projects = sa.table("projects", sa.column("team_id"), sa.column("name"), sa.column("wing"))
    # Space names are not unique. Identify the club by its two existing projects.
    project_names = ("Website Team", "Jev based resume screening")
    clubs = op.get_bind().execute(
        sa.select(teams.c.id)
        .join_from(teams, projects, projects.c.team_id == teams.c.id)
        .where(teams.c.name == "Intel IoT Club", projects.c.name.in_(project_names))
        .group_by(teams.c.id)
        .having(sa.func.count(sa.distinct(projects.c.name)) == len(project_names))
    ).scalars().all()

    op.add_column("teams", sa.Column("wings_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("projects", sa.Column(
        "wing", sa.String(16),
        sa.CheckConstraint("wing IN ('ai', 'physical_ai')", name="ck_projects_wing"),
        nullable=True,
    ))
    if len(clubs) == 1:
        club_id = clubs[0]
        op.execute(teams.update().where(teams.c.id == club_id).values(wings_enabled=True))
        op.execute(projects.update().where(
            projects.c.team_id == club_id,
            projects.c.name.in_(project_names),
        ).values(wing="ai"))


def downgrade():
    op.drop_column("projects", "wing")
    op.drop_column("teams", "wings_enabled")
