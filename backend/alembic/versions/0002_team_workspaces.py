"""Add shared workspaces without modifying existing personal tasks."""
from alembic import op
import sqlalchemy as sa

revision = "0002_team_workspaces"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("teams", sa.Column("id", sa.Integer, primary_key=True), sa.Column("name", sa.String(100), nullable=False), sa.Column("key", sa.String(10), nullable=False), sa.Column("invite_code", sa.String(64), nullable=False, unique=True))
    op.create_table("memberships", sa.Column("id", sa.Integer, primary_key=True), sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False), sa.Column("role", sa.String(20), nullable=False), sa.UniqueConstraint("team_id", "user_id"))
    op.create_table("sprints", sa.Column("id", sa.Integer, primary_key=True), sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False), sa.Column("name", sa.String(100), nullable=False), sa.Column("goal", sa.Text, nullable=False), sa.Column("start_date", sa.Date, nullable=False), sa.Column("end_date", sa.Date, nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("active_team_id", sa.Integer, sa.ForeignKey("teams.id"), unique=True), sa.Column("retrospective", sa.Text, nullable=False))
    op.create_table("issues", sa.Column("id", sa.Integer, primary_key=True), sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False), sa.Column("reporter_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False), sa.Column("assignee_id", sa.Integer, sa.ForeignKey("users.id")), sa.Column("sprint_id", sa.Integer, sa.ForeignKey("sprints.id")), sa.Column("title", sa.String(180), nullable=False), sa.Column("description", sa.Text, nullable=False), sa.Column("acceptance_criteria", sa.Text, nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("priority", sa.String(20), nullable=False), sa.Column("issue_type", sa.String(20), nullable=False), sa.Column("points", sa.Integer, nullable=False), sa.Column("label", sa.String(60), nullable=False), sa.Column("due_date", sa.Date), sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False))
    op.create_table("issue_comments", sa.Column("id", sa.Integer, primary_key=True), sa.Column("issue_id", sa.Integer, sa.ForeignKey("issues.id"), nullable=False), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False), sa.Column("body", sa.Text, nullable=False), sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False))
    op.create_table("team_activity", sa.Column("id", sa.Integer, primary_key=True), sa.Column("team_id", sa.Integer, sa.ForeignKey("teams.id"), nullable=False), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False), sa.Column("message", sa.String(500), nullable=False), sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False))
    for table, columns in {"memberships": ["team_id", "user_id"], "sprints": ["team_id"], "issues": ["team_id", "sprint_id"], "issue_comments": ["issue_id"], "team_activity": ["team_id"]}.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in ["team_activity", "issue_comments", "issues", "sprints", "memberships", "teams"]:
        op.drop_table(table)
