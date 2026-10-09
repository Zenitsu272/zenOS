"""Add email sign-in challenges and persisted abuse limits without changing users."""
from alembic import op
import sqlalchemy as sa


revision = "0007_email_otp"
down_revision = "0006_remove_empty_defaults"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "otp_challenges",
        sa.Column("email", sa.String(255), primary_key=True),
        sa.Column("nonce", sa.String(64), nullable=True),
        sa.Column("code_hash", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_attempts", sa.Integer, nullable=False),
        sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_otp_challenges_updated_at", "otp_challenges", ["updated_at"])
    op.create_table(
        "auth_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("count", sa.Integer, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_rate_limits_expires_at", "auth_rate_limits", ["expires_at"])


def downgrade():
    op.drop_table("auth_rate_limits")
    op.drop_table("otp_challenges")
