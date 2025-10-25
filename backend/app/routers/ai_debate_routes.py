# app/ai_debate_routes.py - FINAL CODE WITH RANDOM TOPICS

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app import database, models, schemas, auth
from app.ai import get_ai_response
from app.socketio_instance import sio
from datetime import datetime
import traceback
import random # Import the random module

router = APIRouter(
    prefix="/ai-debate",
    tags=["AI Debate"]
)

AI_USER_ID = 1

# --- List of Debate Topics (Copied from debate.py for consistency) ---
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

# --- Endpoint to START an AI Debate (Uses Random Topic) ---
@router.post("/start", response_model=schemas.DebateOut)
async def start_ai_debate_route(
    # REMOVED: topic_data: schemas.TopicSchema,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Creates a new AI Debate entry with a random topic."""
    print(f"\n--- DEBUG: AI Route /ai-debate/start ---")
    print(f"Request from User ID {current_user.id}")
    try:
        ai_user = db.query(models.User).filter(models.User.id == AI_USER_ID).first()
        if not ai_user:
            raise HTTPException(status_code=500, detail="AI opponent configuration error.")

        # --- Select a random topic ---
        selected_topic = random.choice(DEBATE_TOPICS)
        print(f"DEBUG start_ai: Selected topic: {selected_topic}")
        # --- End topic selection ---

        db_debate = models.Debate(
            player1_id=current_user.id,
            player2_id=AI_USER_ID,
            topic=selected_topic, # Use the random topic
        )
        db.add(db_debate)
        db.commit()
        db.refresh(db_debate)
        print(f"DEBUG: AI Debate created successfully. ID: {db_debate.id}")
        return db_debate
    except Exception as e:
        db.rollback()
        print(f"\n--- CRITICAL ERROR in /ai-debate/start ---")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to start AI debate.")


# --- Endpoint to handle messages DURING an AI Debate (Unchanged) ---
@router.post("/{debate_id}/{topic}", response_model=schemas.MessageOut)
async def create_ai_message_route(
    debate_id: int,
    topic: str, # Topic is still passed in URL here, might be redundant
    message: schemas.MessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # ... (Your existing logic for handling AI messages remains the same) ...
    # Ensure it uses debate_obj.topic instead of the 'topic' from URL if possible
    print(f"\n--- DEBUG: AI Route /ai-debate/{debate_id}/messages ---")
    print(f"Received message from User ID {current_user.id}: {message.content[:50]}...")
    room_id = str(debate_id)

    try:
        debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
        if not debate_obj: raise HTTPException(status_code=404, detail="Debate not found.")
        # Use the topic from the database object for consistency
        actual_topic = debate_obj.topic
        if current_user.id != debate_obj.player1_id: raise HTTPException(status_code=403, detail="Not authorized.")

        # 1. Save User's Message
        user_message = models.Message(
            content=message.content, sender_type='user',
            debate_id=debate_id, sender_id=current_user.id,
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)
        print(f"DEBUG: User message saved. ID: {user_message.id}")

        # Emit user message back
        try:
            user_message_data = schemas.MessageOut.from_orm(user_message).dict()
            if 'timestamp' in user_message_data and isinstance(user_message_data['timestamp'], datetime):
                user_message_data['timestamp'] = user_message_data['timestamp'].isoformat()
            await sio.emit('new_message', user_message_data, room=room_id)
            print(f"DEBUG: Emitted user's message back to room {room_id}.")
        except Exception as emit_err:
             print(f"ERROR: Failed to emit user message: {emit_err}")

        # 2. Get AI Response (using actual_topic from DB)
        ai_prompt = f"Debate topic: '{actual_topic}'. User '{current_user.username}' said: '{message.content}'. Respond concisely (max 2 sentences) as the opponent."
        print("DEBUG: Calling AI...")
        ai_content = await get_ai_response(ai_prompt)
        print(f"DEBUG: AI response received: {ai_content[:50]}...")
        if not ai_content: ai_content = "(AI had no response)"

        # 3. Save AI's Message
        ai_message = models.Message(
            content=ai_content, debate_id=debate_id,
            sender_type='ai', sender_id=AI_USER_ID,
        )
        db.add(ai_message)
        db.commit()
        db.refresh(ai_message)
        print(f"DEBUG: AI message saved. ID: {ai_message.id}")

        # 4. Prepare and Emit AI's Message
        print("DEBUG: Preparing AI message for broadcast...")
        ai_message_data = schemas.MessageOut.from_orm(ai_message).dict()
        if 'timestamp' in ai_message_data and isinstance(ai_message_data['timestamp'], datetime):
            ai_message_data['timestamp'] = ai_message_data['timestamp'].isoformat()
        print(f"DEBUG: Emitting 'new_message' (AI response) to room {room_id}...")
        await sio.emit('new_message', ai_message_data, room=room_id)
        print(f"DEBUG: AI message emitted successfully.")

        return ai_message

    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        db.rollback()
        print(f"\n--- CRITICAL ERROR in AI Message Route for debate {debate_id} ---")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Server error: {type(e).__name__}")