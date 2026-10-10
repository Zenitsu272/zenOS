"""Project participation for task assignment, retaining existing assignees."""
from alembic import op
import sqlalchemy as sa

revision = "0008_project_memberships"
down_revision = "0007_email_otp"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_memberships",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    # Existing assignments represent participation. Do not enroll all space members
    # or restore access for anyone who has already been removed from the space.
    op.execute(sa.text("""
        INSERT INTO project_memberships (project_id, user_id)
        SELECT DISTINCT i.project_id, i.assignee_id
        FROM issues i
        JOIN projects p ON p.id = i.project_id AND p.team_id = i.team_id
        JOIN memberships m ON m.team_id = p.team_id AND m.user_id = i.assignee_id
        WHERE i.assignee_id IS NOT NULL
    """))


def downgrade():
    op.drop_table("project_memberships")
