from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from .. import database, models, schemas, auth
from ..ai import get_ai_response
from ..socketio_instance import sio
import pdb  # For debugging purposes

import logging
from datetime import datetime
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(
    prefix="/ai-debate",
    tags=["AI Debate"]
)

AI_USER_ID = 1 # Make sure this matches the actual AI user ID in your database

@router.post("/start", response_model=schemas.DebateOut)
async def start_ai_debate_route(
    topic_data: schemas.TopicSchema, # Using the TopicSchema defined in schemas.py
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Creates a new Debate entry between the current user and the AI (AI_USER_ID).
    URL: /ai-debate/start
    """
    
    # 1. Create the debate with user and AI
    # FIX: Removed 'is_ai_debate=True' as it caused TypeError in SQLAlchemy
    db_debate = models.Debate(
        player1_id=current_user.id,
        player2_id=AI_USER_ID,
        topic=topic_data.topic,
        # is_ai_debate=True  <-- REMOVED THIS INVALID KEYWORD
    )
    db.add(db_debate)
    db.commit()
    db.refresh(db_debate)
    
    logger.info(f"AI Debate started for user {current_user.id}. Debate ID: {db_debate.id}")
    
    # Optional: Send a success event or initial AI message if needed
    
    return db_debate


@router.post("/{debate_id}/{topic}", response_model=schemas.MessageOut)
async def create_ai_message_route(
    debate_id: int,
    topic: str,
    message: schemas.MessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # ... (rest of your code, now 'datetime' will be defined for isinstance checks) ...
    logger.debug(f"DEBUG: [1] Entering create_ai_message_route for debate {debate_id}")
    # ...
    try:
        # ... (user message saving logic) ...
        # debate_obg= db.query(models.Debate).filter(models.Debate.id == debate_id).first()
        # user_obj = db.query(models.User).filter(models.User.id == current_user.id).first()
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

        # pdb.set_trace()  # <-- Set a breakpoint here to inspect the user_message object
        # Manual datetime serialization for Socket.IO emit (if schemas.py fix isn't picked up)
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
