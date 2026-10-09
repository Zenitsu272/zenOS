"""Give each space one owner, expiring invites, and independently planned projects.

All existing tasks and plans are preserved in a General project. Personal tables
are not touched.
"""
from datetime import datetime, timedelta, timezone

from alembic import op
import sqlalchemy as sa


revision = "0003_space_projects"
down_revision = "0002_team_workspaces"
branch_labels = None
depends_on = None

NAMING = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade():
    connection = op.get_bind()
    projects = op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
    )
    op.create_index("ix_projects_team_id", "projects", ["team_id"])
    op.add_column("teams", sa.Column("owner_id", sa.Integer, nullable=True))
    op.add_column("teams", sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sprints", sa.Column("project_id", sa.Integer, nullable=True))
    op.add_column("sprints", sa.Column("active_project_id", sa.Integer, nullable=True))
    op.add_column("issues", sa.Column("project_id", sa.Integer, nullable=True))

    teams = sa.table("teams", sa.column("id", sa.Integer), sa.column("owner_id", sa.Integer), sa.column("invite_expires_at", sa.DateTime(timezone=True)))
    members = sa.table("memberships", sa.column("id", sa.Integer), sa.column("team_id", sa.Integer), sa.column("user_id", sa.Integer), sa.column("role", sa.String))
    sprints = sa.table("sprints", sa.column("team_id", sa.Integer), sa.column("project_id", sa.Integer), sa.column("active_project_id", sa.Integer), sa.column("status", sa.String))
    issues = sa.table("issues", sa.column("team_id", sa.Integer), sa.column("project_id", sa.Integer))
    expiry = datetime.now(timezone.utc) + timedelta(days=7)
    for team_id in connection.execute(sa.select(teams.c.id)).scalars().all():
        # Original creators were the first admins. Fall back only for legacy spaces
        # whose role values were modified; never assign ownership to an outsider.
        owner_id = connection.execute(
            sa.select(members.c.user_id).where(members.c.team_id == team_id)
            .order_by(sa.case((members.c.role == "admin", 0), else_=1), members.c.id)
            .limit(1)
        ).scalar_one_or_none()
        if owner_id is None:
            raise RuntimeError(f"Space {team_id} has no members. Restore its creator before migrating.")
        connection.execute(teams.update().where(teams.c.id == team_id).values(owner_id=owner_id, invite_expires_at=expiry))
        connection.execute(members.update().where(members.c.team_id == team_id).values(role=sa.case((members.c.user_id == owner_id, "admin"), else_="member")))
        project_id = connection.execute(projects.insert().values(team_id=team_id, name="General", description="Your existing tasks and work plans.")).inserted_primary_key[0]
        connection.execute(sprints.update().where(sprints.c.team_id == team_id).values(project_id=project_id))
        connection.execute(sprints.update().where(sprints.c.team_id == team_id, sprints.c.status == "active").values(active_project_id=project_id))
        connection.execute(issues.update().where(issues.c.team_id == team_id).values(project_id=project_id))

    with op.batch_alter_table("teams", naming_convention=NAMING) as batch:
        batch.alter_column("owner_id", existing_type=sa.Integer, nullable=False)
        batch.alter_column("invite_expires_at", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch.create_foreign_key("fk_teams_owner_id_users", "users", ["owner_id"], ["id"])
    inspector = sa.inspect(connection)
    old_active_fk = next(item["name"] for item in inspector.get_foreign_keys("sprints") if item["constrained_columns"] == ["active_team_id"])
    old_active_unique = next(item["name"] for item in inspector.get_unique_constraints("sprints") if item["column_names"] == ["active_team_id"])
    with op.batch_alter_table("sprints", naming_convention=NAMING) as batch:
        batch.drop_constraint(old_active_fk or "fk_sprints_active_team_id_teams", type_="foreignkey")
        batch.drop_constraint(old_active_unique or "uq_sprints_active_team_id", type_="unique")
        batch.drop_column("active_team_id")
        batch.alter_column("project_id", existing_type=sa.Integer, nullable=False)
        batch.create_foreign_key("fk_sprints_project_id_projects", "projects", ["project_id"], ["id"])
        batch.create_foreign_key("fk_sprints_active_project_id_projects", "projects", ["active_project_id"], ["id"])
        batch.create_unique_constraint("uq_sprints_active_project_id", ["active_project_id"])
        batch.create_index("ix_sprints_project_id", ["project_id"])
    with op.batch_alter_table("issues", naming_convention=NAMING) as batch:
        batch.alter_column("project_id", existing_type=sa.Integer, nullable=False)
        batch.create_foreign_key("fk_issues_project_id_projects", "projects", ["project_id"], ["id"])
        batch.create_index("ix_issues_project_id", ["project_id"])


def downgrade():
    connection = op.get_bind()
    sprints = sa.table("sprints", sa.column("team_id", sa.Integer), sa.column("active_team_id", sa.Integer), sa.column("status", sa.String))
    duplicate_active = connection.execute(sa.select(sprints.c.team_id).where(sprints.c.status == "active").group_by(sprints.c.team_id).having(sa.func.count() > 1)).first()
    if duplicate_active:
        raise RuntimeError("Finish extra active work plans before downgrading: the old version allows only one per space.")
    op.add_column("sprints", sa.Column("active_team_id", sa.Integer, nullable=True))
    connection.execute(sprints.update().where(sprints.c.status == "active").values(active_team_id=sprints.c.team_id))
    with op.batch_alter_table("issues", naming_convention=NAMING) as batch:
        batch.drop_constraint("fk_issues_project_id_projects", type_="foreignkey")
        batch.drop_index("ix_issues_project_id")
        batch.drop_column("project_id")
    with op.batch_alter_table("sprints", naming_convention=NAMING) as batch:
        batch.drop_constraint("fk_sprints_project_id_projects", type_="foreignkey")
        batch.drop_constraint("fk_sprints_active_project_id_projects", type_="foreignkey")
        batch.drop_constraint("uq_sprints_active_project_id", type_="unique")
        batch.drop_index("ix_sprints_project_id")
        batch.drop_column("active_project_id")
        batch.drop_column("project_id")
        batch.create_foreign_key("fk_sprints_active_team_id_teams", "teams", ["active_team_id"], ["id"])
        batch.create_unique_constraint("uq_sprints_active_team_id", ["active_team_id"])
    with op.batch_alter_table("teams", naming_convention=NAMING) as batch:
        batch.drop_constraint("fk_teams_owner_id_users", type_="foreignkey")
        batch.drop_column("owner_id")
        batch.drop_column("invite_expires_at")
    op.drop_table("projects")
