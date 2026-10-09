"""Add editable space descriptions and project meetings with review history."""
from alembic import op
import sqlalchemy as sa


revision = "0005_space_meetings"
down_revision = "0004_empty_personal_workspace"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("teams", sa.Column("description", sa.Text, nullable=False, server_default=""))
    op.create_table(
        "meetings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("agenda", sa.Text, nullable=False),
        sa.Column("meeting_url", sa.String(2000), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text, nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "meeting_task_updates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("meeting_id", sa.Integer, sa.ForeignKey("meetings.id"), nullable=False),
        sa.Column("issue_id", sa.Integer, sa.ForeignKey("issues.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issue_title", sa.String(180), nullable=False),
        sa.Column("from_status", sa.String(20), nullable=False),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for table, columns in {"meetings": ["team_id", "project_id"], "meeting_task_updates": ["meeting_id", "issue_id"]}.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    op.drop_table("meeting_task_updates")
    op.drop_table("meetings")
    with op.batch_alter_table("teams") as batch:
        batch.drop_column("description")
