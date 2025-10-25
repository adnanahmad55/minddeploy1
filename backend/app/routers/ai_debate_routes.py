# app/ai_debate_routes.py - FINAL DEBUGGING CODE FOR AI EMIT

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
@router.post("/start", response_model=schemas.DebateOut)
async def start_ai_debate_route(
    topic_data: schemas.TopicSchema, # Expecting {"topic": "..."}
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Creates a new Debate entry between the current user and the AI."""
    print(f"\n--- DEBUG: AI Route /ai-debate/start ---")
    print(f"Request from User ID {current_user.id} for topic: {topic_data.topic}")
    try:
        # Check if AI user exists (optional but good practice)
        ai_user = db.query(models.User).filter(models.User.id == AI_USER_ID).first()
        if not ai_user:
            print(f"ERROR: AI User with ID {AI_USER_ID} not found in database.")
            raise HTTPException(status_code=500, detail="AI opponent configuration error.")

        db_debate = models.Debate(
            player1_id=current_user.id,
            player2_id=AI_USER_ID, # AI is player 2
            topic=topic_data.topic,
            # Add any other relevant fields like is_ai_debate=True if your model supports it
        )
        db.add(db_debate)
        db.commit()
        db.refresh(db_debate)
        print(f"DEBUG: AI Debate created successfully. ID: {db_debate.id}")
        print(f"--- END DEBUG: AI Route /start ---")
        return db_debate
    except Exception as e:
        db.rollback() # Rollback in case of error
        print(f"\n--- CRITICAL ERROR in /ai-debate/start ---")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to start AI debate: {type(e).__name__}")


# --- Endpoint to handle messages DURING an AI Debate ---
@router.post("/{debate_id}/{topic}", response_model=schemas.MessageOut)
async def create_ai_message_route(
    debate_id: int,
    topic: str, # Topic might be redundant if already in debate_obj
    message: schemas.MessageCreate, # Expecting user's message {"content": "..."}
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    print(f"\n--- DEBUG: AI Route /ai-debate/{debate_id}/messages ---")
    print(f"Received message from User ID {current_user.id}: {message.content[:50]}...")

    try:
        # Validate debate exists and user is part of it
        debate_obj = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
        if not debate_obj:
             print(f"ERROR: Debate {debate_id} not found.")
             raise HTTPException(status_code=404, detail="Debate not found.")
        if current_user.id != debate_obj.player1_id: # Assuming user is always player1 vs AI
             print(f"ERROR: User {current_user.id} not authorized for debate {debate_id}.")
             raise HTTPException(status_code=403, detail="Not authorized for this debate.")

        # 1. Save User's Message (already validated sender is current_user)
        user_message = models.Message(
            content=message.content,
            sender_type='user',
            debate_id=debate_id,
            sender_id=current_user.id,
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)
        print(f"DEBUG: User message saved. ID: {user_message.id}")

        # OPTIONAL: Emit user message back via SocketIO immediately
        # user_message_data = schemas.MessageOut.from_orm(user_message).dict()
        # if 'timestamp' in user_message_data: user_message_data['timestamp'] = user_message_data['timestamp'].isoformat()
        # await sio.emit('new_message', user_message_data, room=str(debate_id))
        # print(f"DEBUG: Emitted user's own message back to room {debate_id}")

        # 2. Get AI Response
        ai_prompt = f"Debate topic: '{debate_obj.topic}'. User '{current_user.username}' said: '{message.content}'. Respond concisely (max 2 sentences) as the opponent."
        print("DEBUG: Calling AI...")
        ai_content = await get_ai_response(ai_prompt) # Assuming get_ai_response returns a string
        print(f"DEBUG: AI response received: {ai_content[:50]}...")
        if not ai_content: # Handle empty AI response
             ai_content = "(AI had no response)"

        # 3. Save AI's Message
        ai_message = models.Message(
            content=ai_content,
            debate_id=debate_id,
            sender_type='ai',
            sender_id=AI_USER_ID, # AI user ID
        )
        db.add(ai_message)
        db.commit()
        db.refresh(ai_message)
        print(f"DEBUG: AI message saved. ID: {ai_message.id}")

        # 4. Prepare and Emit AI's Message via Socket.IO
        print("DEBUG: Preparing AI message for broadcast...")
        ai_message_data = schemas.MessageOut.from_orm(ai_message).dict()
        # Ensure timestamp is ISO format
        if 'timestamp' in ai_message_data and isinstance(ai_message_data['timestamp'], datetime):
            ai_message_data['timestamp'] = ai_message_data['timestamp'].isoformat()
        print("DEBUG: AI message data prepared:", ai_message_data)

        room_id = str(debate_id)
        print(f"DEBUG: Emitting 'new_message' (AI response) to room {room_id}...")
        await sio.emit('new_message', ai_message_data, room=room_id) # <<< CRITICAL EMIT
        print(f"DEBUG: AI message emitted successfully to room {room_id}.")
        print(f"--- END DEBUG: AI Route /messages ---")

        # Return the AI message object via HTTP (as per response_model)
        # Note: Frontend should rely on the socket event, not this HTTP response for the AI message
        return ai_message

    except HTTPException as http_exc:
         # Re-raise HTTP exceptions directly
         raise http_exc
    except Exception as e:
        db.rollback() # Rollback on any other error
        print(f"\n--- CRITICAL ERROR in AI Message Route for debate {debate_id} ---")
        traceback.print_exc()
        # Return a generic 500 error but don't expose internal details
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Server error during AI message processing.")