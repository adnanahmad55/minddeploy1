"""Alembic Manual Fix: Makes player2_id nullable for matchmaking"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a_manual_fix_for_player2_nullable'
down_revision = 'Your_Previous_Revision_ID' # <-- Change this to your previous Alembic ID
branch_labels = None
depends_on = None

def upgrade():
    # 'player2_id' कॉलम से NOT NULL प्रतिबंध हटाता है
    op.alter_column('debates', 'player2_id',
               existing_type=sa.Integer(),
               nullable=True,
               existing_server_default=sa.text('null'))

def downgrade():
    # 'player2_id' कॉलम पर NOT NULL प्रतिबंध वापस लगाता है (अगर डाउनग्रेड करना हो)
    op.alter_column('debates', 'player2_id',
               existing_type=sa.Integer(),
               nullable=False,
               existing_server_default=sa.text('null'))