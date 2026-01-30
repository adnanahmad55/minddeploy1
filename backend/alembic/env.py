from logging.config import fileConfig
import os 
import sys
from sqlalchemy import create_engine
from sqlalchemy import pool
from alembic import context

# --- CRITICAL FIX SECTION ---
current_alembic_dir = os.path.dirname(__file__)
backend_dir = os.path.abspath(os.path.join(current_alembic_dir, '..'))
sys.path.append(backend_dir)

from app.database import Base 
import app.models # Sare models load karne ke liye zaroori hai

target_metadata = Base.metadata 
# --- END CRITICAL FIX SECTION ---

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

def run_migrations_offline() -> None:
    url = os.environ.get("DATABASE_URL")
    if url and url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    
    context.configure(
        url=url,
        target_metadata=target_metadata,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    # Environment Variable se URL uthayein
    DB_URL = os.environ.get("DATABASE_URL")
    
    if DB_URL:
        # Protocol Fix (Render/Railway issues)
        if DB_URL.startswith("postgres://"):
            DB_URL = DB_URL.replace("postgres://", "postgresql://", 1)
        
        # Driver Fix (SQLAlchemy 2.0 requirements)
        if "postgresql+psycopg2://" not in DB_URL:
            DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        
        # SSL Fix for Neon/Cloud DBs
        if "sslmode" not in DB_URL:
            sep = "&" if "?" in DB_URL else "?"
            DB_URL += f"{sep}sslmode=require"

    connectable = create_engine(
        DB_URL, 
        poolclass=pool.NullPool
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            dialect_opts={"paramstyle": "named"},
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()