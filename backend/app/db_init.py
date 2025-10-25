import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from app.database import engine

def fix_player2_id_nullable():
    """
    Ensures the player2_id column in the 'debates' table is nullable.
    This bypasses the ForeignKeyViolation when starting human matchmaking 
    and avoids using complex Alembic commands on the server.
    """
    try:
        # Create a session to execute the raw SQL command
        Session = sessionmaker(bind=engine)
        session = Session()

        print("INFO: Attempting to run direct SQL fix for player2_id...")
        
        # SQL command to remove the NOT NULL constraint
        sql_command = sa.text(
            "ALTER TABLE debates ALTER COLUMN player2_id DROP NOT NULL;"
        )
        
        session.execute(sql_command)
        session.commit()
        
        print("SUCCESS: player2_id column successfully set to nullable.")
        
    except sa.exc.ProgrammingError as e:
        # This error is expected if the constraint is already dropped (which is good)
        if "column " in str(e) and "does not exist" in str(e):
             print("WARNING: Table or column may not exist yet, skipping fix.")
        elif "null constraint" in str(e):
             print("INFO: player2_id is already nullable, skipping direct fix.")
        else:
             print(f"ERROR: Database Programming Error during fix: {e}")
        session.rollback()
        
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to execute database fix: {e}")
        session.rollback()
    
    finally:
        session.close()

# Note: You must call this function in app/main.py before starting FastAPI.