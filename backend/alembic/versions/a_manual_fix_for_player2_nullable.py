"""Alembic Manual Fix: Makes player2_id nullable for matchmaking"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
# IMPORTANT: Change this revision ID to be unique!
revision = 'a_manual_fix_for_player2_nullable' 
# CRITICAL FIX: Set to None to make this the start of the chain (if no other revisions), 
# or set to the ID of your last existing revision.
down_revision = None 
branch_labels = None
depends_on = None

def upgrade():
    # 'player2_id' कॉलम से NOT NULL प्रतिबंध हटाता है
    op.alter_column('debates', 'player2_id',
               existing_type=sa.Integer(),
               nullable=True,
               existing_server_default=sa.text('null'),
               schema=None) # Adding schema=None for compatibility

def downgrade():
    # 'player2_id' कॉलम पर NOT NULL प्रतिबंध वापस लगाता है
    op.alter_column('debates', 'player2_id',
               existing_type=sa.Integer(),
               nullable=False,
               existing_server_default=sa.text('null'),
               schema=None)