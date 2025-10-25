from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
# from .ai import get_ai_response # Not directly used in this snippet
from ..socketio_instance import sio # Keep this if you plan to emit from here later
# from .evaluation import evaluate_debate # Not directly used in this snippet

router = APIRouter(
    prefix="/debate",
    tags=["Debates"]
)

# ----------------- CREATE DEBATE -----------------
@router.post("/", response_model=schemas.DebateOut)
def create_debate_route(debate_data: schemas.DebateCreate, db: Session = Depends(get_db)):
    # Create the debate with both player IDs
    db_debate = models.Debate(
        player1_id=debate_data.player1_id,
        player2_id=debate_data.player2_id,
        topic=debate_data.topic
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    return db_debate

# --- NEW FIX: Endpoint for starting Human Matchmaking (POST /debate/start-human) ---
@router.post("/start-human", response_model=schemas.DebateOut)
def start_human_match_route(
    topic_data: schemas.TopicSchema, # Use the TopicSchema defined in schemas.py
    db: Session = Depends(get_db),
    # Assuming you have a way to get the current user here, e.g.,
    # current_user: models.User = Depends(auth.get_current_user) 
    # For now, we'll mock player IDs since authentication is in scope
):
    """
    Creates a preliminary debate object to signify a match is being sought.
    The real player2_id will be updated when a match is found.
    """
    # NOTE: You MUST replace 99 and 0 with actual user retrieval and placeholder IDs
    # For testing, we create a temporary match object. Player2 ID is 0 for placeholder.
    # Player1 ID should come from auth.get_current_user, but mocked for safety here.
    
    # Placeholder User IDs (Please integrate your actual user authentication here)
    placeholder_player1_id = 9999 # Replace with actual user ID from auth.get_current_user
    placeholder_player2_id = 0 # Placeholder ID for the user being sought
    
    db_debate = models.Debate(
        player1_id=placeholder_player1_id,
        player2_id=placeholder_player2_id,
        topic=topic_data.topic,
        # is_active=True, etc. (add status columns if needed)
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    
    # The frontend will now use this debate ID when joining the matchmaking queue.
    # It returns the created debate object which contains the debate ID (data.id).
    return db_debate
# --- END NEW FIX ---


# ----------------- GET DEBATE BY ID -----------------
@router.get("/{debate_id}", response_model=schemas.DebateOut)
def get_debate_route(debate_id: int, db: Session = Depends(get_db)):
    db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
    if not db_debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    return db_debate

# ----------------- CREATE MESSAGE IN DEBATE -----------------
@router.post("/{debate_id}/messages", response_model=schemas.MessageOut)
def create_message_route(debate_id: int, message: schemas.MessageCreate, db: Session = Depends(get_db)):
    # Ensure debate exists
    # It's good practice to fetch the debate to ensure it's active/valid
    debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
    if not debate_obj:
        raise HTTPException(status_code=404, detail="Debate not found")
    
    db_message = models.Message(**message.dict(), debate_id=debate_id)
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

# ----------------- GET ALL MESSAGES IN A DEBATE -----------------
@router.get("/{debate_id}/messages", response_model=list[schemas.MessageOut])
def get_messages_route(debate_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Message)
        .filter(models.Message.debate_id == debate_id)
        .order_by(models.Message.timestamp)
        .all()
    )
