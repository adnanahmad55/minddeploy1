# alembic/env.py
from logging.config import fileConfig
import os 
import sys

from sqlalchemy import engine_from_config, create_engine # <--- create_engine को जोड़ा गया
from sqlalchemy import pool

from alembic import context # <--- context इंपोर्ट की पुष्टि

# --------------------------------------------------------------------------
# *** CRITICAL FIX SECTION - CODE DISCOVERY AND TARGET METADATA ***

# 1. Project Root को sys.path में जोड़ना (यह हिस्सा आपका लोकल कोड है)
current_alembic_dir = os.path.dirname(__file__)
backend_dir = os.path.abspath(os.path.join(current_alembic_dir, '..'))
sys.path.append(backend_dir)

# 2. Base और Models को इंपोर्ट करना (ज़रूरी)
from app.database import Base # Base क्लास को इंपोर्ट करें
import app.models             # सभी मॉडल्स को रजिस्टर करने के लिए

# 3. target_metadata को GLOBAL SCOPE में डिफाइन करना (NameError fix)
#    यह सुनिश्चित करता है कि यह variable नीचे run_migrations_online() में उपलब्ध है।
target_metadata = Base.metadata 

# *** END CRITICAL FIX SECTION ***
# --------------------------------------------------------------------------


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode. (Unmodified)"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode. (Modified for Railway)"""
    
    # ----------------------------------------------------
    # *** यहां DATABASE_URL FIX लागू किया गया है ***
    
    # 1. Environment Variable से DATABASE_URL पढ़ें
    DB_URL = os.environ.get("DATABASE_URL")
    
    # 2. Protocol Fix लगाएं (postgres:// को postgresql:// में बदलता है)
    if DB_URL and DB_URL.startswith("postgres://"):
        DB_URL = DB_URL.replace("postgres://", "postgresql://", 1)

    # 3. Connection के लिए एक नया Engine बनाएं (DB_URL का उपयोग करके)
    connectable = create_engine(
        DB_URL, 
        poolclass=pool.NullPool
    )
    # ----------------------------------------------------
    
    # Connection का उपयोग करके माइग्रेशन चलाएं
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            dialect_opts={"paramstyle": "named"},
        )

        with context.begin_transaction():
            context.run_migrations()


# ----------------------------------------------------
# *** FINAL EXECUTION BLOCK (context NameError fix) ***

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()