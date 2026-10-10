"""Keep task assignment dates independent of deadlines and status changes."""
from alembic import op
import sqlalchemy as sa

revision = "0010_issue_assigned_date"
down_revision = "0009_empty_legacy_folders"
branch_labels = None
depends_on = None


def upgrade():
    # Historical assignment dates are unknown; do not infer them from deadlines.
    op.add_column("issues", sa.Column("assigned_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("issues", "assigned_date")
