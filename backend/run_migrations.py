from alembic.config import Config
from alembic import command
import os

def run_migrations(autogenerate=False):
    print("Running migrations...")
    # Get the absolute path to the backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    if autogenerate:
        command.revision(alembic_cfg, autogenerate=True, message="Add badges and streaks tables")
    else:
        command.upgrade(alembic_cfg, "head")
    print("Migrations complete.")

if __name__ == "__main__":
    run_migrations(autogenerate=True)
