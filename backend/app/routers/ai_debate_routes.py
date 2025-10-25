# app/ai_debate_routes.py - FINAL CODE WITH USER MESSAGE EMIT

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app import database, models, schemas, auth
from app.ai import get_ai_response # Ensure AI function is correctly imported
from app.socketio_instance import sio # Ensure sio is imported
from datetime import datetime
import traceback

router = APIRouter(
    prefix="/ai-debate",
    tags=["AI Debate"]
)

AI_USER_ID = 1 # Define your AI user ID

# --- Endpoint to START an AI Debate ---
# ... (start_ai_debate_route remains the same) ...
@router.post("/start", response_model=schemas.DebateOut)
async def start_ai_debate_route(
    topic_data: schemas.TopicSchema, # Expecting {"topic": "..."}
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # ... (Implementation is correct and unchanged) ...
    print(f"\n--- DEBUG: AI Route /ai-debate/start ---")
    print(f"Request from User ID {current_user.id} for topic: {topic_data.topic}")
    try:
        ai_user = db.query(models.User).filter(models.User.id == AI_USER_ID).first()
        if not ai_user:
            print(f"ERROR: AI User with ID {AI_USER_ID} not found in database.")
            raise HTTPException(status_code=500, detail="AI opponent configuration error.")

        db_debate = models.Debate(
            player1_id=current_user.id,
            player2_id=AI_USER_ID,
            topic=topic_data.topic,
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
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to start AI debate: {type(e).__name__}")


# --- Endpoint to handle messages DURING an AI Debate ---
@router.post("/{debate_id}/{topic}", response_model=schemas.MessageOut)
async def create_ai_message_route(
    debate_id: int,
    topic: str,
    message: schemas.MessageCreate, # Expecting user's message
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    print(f"\n--- DEBUG: AI Route /ai-debate/{debate_id}/messages ---")
    print(f"Received message from User ID {current_user.id}: {message.content[:50]}...")
    room_id = str(debate_id) # Define room_id early

    try:
        # Validate debate exists and user is part of it
        debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
        if not debate_obj: raise HTTPException(status_code=404, detail="Debate not found.")
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

        # *** CRITICAL FIX: Emit the user's message back immediately ***
        try:
            print("DEBUG: Preparing user message for broadcast...")
            user_message_data = schemas.MessageOut.from_orm(user_message).dict()
            if 'timestamp' in user_message_data and isinstance(user_message_data['timestamp'], datetime):
                user_message_data['timestamp'] = user_message_data['timestamp'].isoformat()
            print("DEBUG: User message data prepared:", user_message_data)
            print(f"DEBUG: Emitting user's 'new_message' to room {room_id}...")
            await sio.emit('new_message', user_message_data, room=room_id)
            print(f"DEBUG: User message emitted successfully to room {room_id}.")
        except Exception as emit_err:
             print(f"ERROR: Failed to emit user message: {emit_err}")
             # Continue to get AI response even if emit fails
        # *** END CRITICAL FIX ***

        # 2. Get AI Response
        ai_prompt = f"Debate topic: '{debate_obj.topic}'. User '{current_user.username}' said: '{message.content}'. Respond concisely (max 2 sentences) as the opponent."
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

        # 4. Prepare and Emit AI's Message via Socket.IO
        print("DEBUG: Preparing AI message for broadcast...")
        ai_message_data = schemas.MessageOut.from_orm(ai_message).dict()
        if 'timestamp' in ai_message_data and isinstance(ai_message_data['timestamp'], datetime):
            ai_message_data['timestamp'] = ai_message_data['timestamp'].isoformat()
        print("DEBUG: AI message data prepared:", ai_message_data)

        print(f"DEBUG: Emitting 'new_message' (AI response) to room {room_id}...")
        await sio.emit('new_message', ai_message_data, room=room_id)
        print(f"DEBUG: AI message emitted successfully to room {room_id}.")
        print(f"--- END DEBUG: AI Route /messages ---")

        # Return the AI message object via HTTP (frontend should ignore this for display)
        return ai_message

    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        db.rollback()
        print(f"\n--- CRITICAL ERROR in AI Message Route for debate {debate_id} ---")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Server error: {type(e).__name__}")