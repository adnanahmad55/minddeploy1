# alembic/env.py
from logging.config import fileConfig
import os 
import sys

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import create_engine  # <--- यह लाइन जोड़ें
from alembic import context
# ... (फाइल का ऊपरी हिस्सा - इसमें कोई बदलाव न करें)

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    
    # ----------------------------------------------------
    # *** यहां नया कोड डालें ***
    
    # 1. Environment Variable से DATABASE_URL पढ़ें
    DB_URL = os.environ.get("DATABASE_URL")
    
    # 2. Protocol Fix लगाएं
    if DB_URL and DB_URL.startswith("postgres://"):
        DB_URL = DB_URL.replace("postgres://", "postgresql://", 1)

    # 3. Connection के लिए एक नया Engine बनाएं
    #    ध्यान दें: हमने यहां engine_from_config की जगह create_engine इस्तेमाल किया है।
    connectable = create_engine(
        DB_URL, 
        poolclass=pool.NullPool
    )
    # *** नए कोड का अंत ***
    # ----------------------------------------------------
    
    # OLD CODE (जो आप हटा रहे हैं):
    # connectable = engine_from_config(
    #     config.get_section(config.config_ini_section, {}),
    #     prefix="sqlalchemy.",
    #     poolclass=pool.NullPool,
    # )

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

# ... (फाइल का बाकी हिस्सा)