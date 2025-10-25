from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from .. import database, models, schemas, auth
from ..ai import get_ai_response
from ..socketio_instance import sio
import pdb 

import logging
from datetime import datetime
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(
    prefix="/ai-debate",
    tags=["AI Debate"]
)

# AI User ID (Must exist in your database's User table)
AI_USER_ID = 1

# ----------------- NEW ENDPOINT: START AI DEBATE -----------------
@router.post("/start", response_model=schemas.DebateOut)
async def start_ai_debate_route(
    topic_data: schemas.TopicSchema, # Assuming a schema like { "topic": "some topic string" }
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Creates a new Debate entry between the current user and the AI.
    This handles the POST request from the '/ai-debate/start' URL.
    """
    logger.debug(f"DEBUG: [START AI] User {current_user.id} starting AI debate on topic: {topic_data.topic}")
    
    # Check if the AI user exists
    if AI_USER_ID is None:
        raise HTTPException(status_code=500, detail="AI opponent ID is not configured.")

    # 1. Create the debate entry
    db_debate = models.Debate(
        player1_id=current_user.id,
        player2_id=AI_USER_ID,
        topic=topic_data.topic,
        is_ai_debate=True # Optional: helpful for tracking
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    
    logger.info(f"INFO: New AI Debate created with ID: {db_debate.id} for user {current_user.id}.")
    
    # NOTE: The frontend expects the full debate object to navigate.
    return db_debate

# ----------------- EXISTING ENDPOINT: CREATE AI MESSAGE -----------------
# NOTE: Frontend will call this endpoint AFTER the debate is created.
@router.post("/{debate_id}/{topic}", response_model=schemas.MessageOut)
async def create_ai_message_route(
    debate_id: int,
    topic: str,
    message: schemas.MessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # ... (rest of your existing message creation and AI logic) ...
    logger.debug(f"DEBUG: [1] Entering create_ai_message_route for debate {debate_id}")
    # ...
    try:
        # ... (user message saving logic) ...
        user_message = models.Message(
            content=message.content,
            sender_type='user',
            debate_id=debate_id,
            sender_id=current_user.id,
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)
        logger.debug(f"DEBUG: [3] User message saved successfully with ID: {user_message.id}")

        user_message_data = schemas.MessageOut.from_orm(user_message).dict()
        if 'timestamp' in user_message_data and isinstance(user_message_data['timestamp'], datetime):
            user_message_data['timestamp'] = user_message_data['timestamp'].isoformat()
        
        await sio.emit('new_message', user_message_data, room=str(debate_id))
        logger.debug("DEBUG: [4] User message emitted via Socket.IO after manual datetime conversion.")

        # ... (AI response generation) ...
        ai_prompt = f"The debate topic is '{topic}'. User '{current_user.username}' just said: '{message.content}'. Respond to this argument from the perspective of the AI opponent. Keep your response concise (max 2 sentences)."
        logger.debug(f"DEBUG: [5] Calling get_ai_response. Prompt starts: '{ai_prompt[:70]}...'")
        ai_content = await get_ai_response(ai_prompt)
        logger.debug(f"DEBUG: [6] AI response received. Content starts: '{ai_content[:70]}...'")
        logger.debug(f"DEBUG: [6.1] AI response length: {len(ai_content)}")

        # ... (AI message saving logic) ...
        ai_message = models.Message(
            content=ai_content,
            debate_id=debate_id,
            sender_type='ai',
            sender_id=AI_USER_ID if AI_USER_ID is not None else None,
        )
        db.add(ai_message)
        db.commit()
        db.refresh(ai_message)
        logger.debug(f"DEBUG: [7] AI message saved with ID: {ai_message.id}")

        # Manual datetime serialization for AI message Socket.IO emit
        ai_message_data = schemas.MessageOut.from_orm(ai_message).dict()
        if 'timestamp' in ai_message_data and isinstance(ai_message_data['timestamp'], datetime):
            ai_message_data['timestamp'] = ai_message_data['timestamp'].isoformat()

        await sio.emit('new_message', ai_message_data, room=str(debate_id))
        logger.debug("DEBUG: [8] AI message emitted via Socket.IO after manual datetime conversion.")

        return ai_message

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"CRITICAL ERROR in create_ai_message_route for debate {debate_id}. Execution halted at previous DEBUG step.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected server error occurred during message processing.")
