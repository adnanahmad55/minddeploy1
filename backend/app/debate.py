from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, schemas, database, auth 
from app.socketio_instance import sio # Used for potential future emit or in other modules

router = APIRouter(
    prefix="/debate",
    tags=["Debates"]
)

# ----------------- CREATE DEBATE -----------------
@router.post("/", response_model=schemas.DebateOut)
def create_debate_route(debate_data: schemas.DebateCreate, db: Session = Depends(database.get_db)):
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

# --- FIX: Endpoint for starting Human Matchmaking (POST /debate/start-human) ---
@router.post("/start-human", response_model=schemas.DebateOut)
def start_human_match_route(
    topic_data: schemas.TopicSchema, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) # Authenticated user
):
    """
    Creates a preliminary debate object for matchmaking. player2_id is set to None.
    """
    player1_id = current_user.id 
    placeholder_player2_id = None # CRITICAL FIX: Use None instead of 0
    
    db_debate = models.Debate(
        player1_id=player1_id,
        player2_id=placeholder_player2_id, # This is valid because we fixed models.py
        topic=topic_data.topic,
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    
    return db_debate
# --- END FIX ---


# ----------------- GET DEBATE BY ID -----------------
@router.get("/{debate_id}", response_model=schemas.DebateOut)
def get_debate_route(debate_id: int, db: Session = Depends(database.get_db)):
    db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
    if not db_debate:
        raise HTTPException(status_code=404, detail="Debate not found")
    return db_debate

# ----------------- CREATE MESSAGE IN DEBATE -----------------
@router.post("/{debate_id}/messages", response_model=schemas.MessageOut)
def create_message_route(debate_id: int, message: schemas.MessageCreate, db: Session = Depends(database.get_db)):
    # Ensure debate exists
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
def get_messages_route(debate_id: int, db: Session = Depends(database.get_db)):
    return (
        db.query(models.Message)
        .filter(models.Message.debate_id == debate_id)
        .order_by(models.Message.timestamp)
        .all()
    )