# app/debate.py - FINAL COMPLETE CODE (Random Topic & Correct Route)

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, schemas, database, auth # Gunicorn-safe absolute imports
# from app.socketio_instance import sio # Not needed in this specific file
import random # Import the random module
from app.socketio_instance import sio
router = APIRouter(
    prefix="/debate", # Base prefix for all routes in this file
    tags=["Debates"]
)

# --- List of Debate Topics ---
DEBATE_TOPICS = [
    "Should social media platforms censor content?",
    "Is universal basic income a viable solution to poverty?",
    "Should animal testing be banned completely?",
    "Is artificial intelligence more beneficial or harmful to humanity?",
    "Should college education be free for everyone?",
    "Is climate change primarily caused by human activity?",
    "Should voting be mandatory in democratic countries?",
    "Is homework beneficial for students?",
    "Should plastic production be significantly reduced?",
    "Does technology make people more isolated?",
    "Should genetically modified foods be labeled?",
    "Is space exploration worth the investment?"
]

# ----------------- CREATE DEBATE (Optional - if needed elsewhere) -----------------
@router.post("/", response_model=schemas.DebateOut, include_in_schema=False) # Hiding from docs unless needed
def create_debate_route(debate_data: schemas.DebateCreate, db: Session = Depends(database.get_db)):
    # This might be used internally or by an admin perhaps
    db_debate = models.Debate(
        player1_id=debate_data.player1_id,
        player2_id=debate_data.player2_id,
        topic=debate_data.topic
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    return db_debate

# --- Endpoint for starting Human Matchmaking ---
# Correct path will be POST /debate/start-human
@router.post("/start-human", response_model=schemas.DebateOut)
def start_human_match_route(
    # Body is no longer needed as topic is random
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) # Ensure user is authenticated
):
    """Creates a preliminary debate object with a random topic for human matchmaking."""
    if not current_user:
         # This should technically be handled by auth.get_current_user, but adding safety
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    player1_id = current_user.id
    placeholder_player2_id = None # Set to None for nullable foreign key
    selected_topic = random.choice(DEBATE_TOPICS) # Select a random topic
    print(f"DEBUG start_human: User {player1_id} starting search. Topic: {selected_topic}")

    try:
        db_debate = models.Debate(
            player1_id=player1_id,
            player2_id=placeholder_player2_id,
            topic=selected_topic,
        )
        db.add(db_debate)
        db.commit()
        db.refresh(db_debate)
        print(f"DEBUG start_human: Debate {db_debate.id} created for user {player1_id}")
        return db_debate
    except Exception as e:
        db.rollback() # Rollback on error
        print(f"CRITICAL DB ERROR in start_human_match_route: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create debate session.")


# ----------------- GET DEBATE BY ID -----------------
@router.post("/{debate_id}/messages", response_model=schemas.MessageOut)
async def create_message_route( # ✅ FIX 2: Function ko async banao
    debate_id: int,
    message: schemas.MessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) 
):
    debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
    if not debate_obj:
        raise HTTPException(status_code=404, detail="Debate not found")

    sender_id_to_use = current_user.id 
    is_authorized = (debate_obj.player1_id == sender_id_to_use) or \
                    (debate_obj.player2_id is not None and debate_obj.player2_id == sender_id_to_use)
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to post message in this debate.")

    db_message = models.Message(
        content=message.content, 
        sender_type='user',
        debate_id=debate_id, 
        sender_id=sender_id_to_use
    )
    try:
        db.add(db_message)
        db.commit()
        db.refresh(db_message)
        
        # ✅ CRITICAL FIX 3: Message ko broadcast karo
        from datetime import datetime # Import datetime here if not at the top
        message_data = schemas.MessageOut.from_orm(db_message).dict()
        
        # Serialize datetime object if necessary
        if 'timestamp' in message_data and isinstance(message_data['timestamp'], datetime):
            message_data['timestamp'] = message_data['timestamp'].isoformat()
            
        room_id = str(debate_id)
        await sio.emit('new_message', message_data, room=room_id) # ⬅️ MESSAGE BROADCASTED

        return db_message
    except Exception as e:
        db.rollback() 
        print(f"ERROR creating message via HTTP: {e}")
        raise HTTPException(status_code=500, detail="Could not save message.")


# ----------------- GET ALL MESSAGES IN A DEBATE -----------------
@router.get("/{debate_id}/messages", response_model=list[schemas.MessageOut])
# ... (get_messages_route remains the same) ...
def get_messages_route(
    debate_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) 
):
     # ... (Your authorization and query logic) ...
    debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
    if not debate_obj:
        raise HTTPException(status_code=404, detail="Debate not found")
    
    return (
        db.query(models.Message)
        .filter(models.Message.debate_id == debate_id)
        .order_by(models.Message.timestamp)
        .all()
    )