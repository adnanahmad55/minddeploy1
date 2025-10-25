# app/matchmaking.py - FINAL DEBUGGING CODE FOR MESSAGES

from app.socketio_instance import sio
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
# FIX: evaluation import needs correct path if it exists
# from app.evaluation import evaluate_debate # Assuming this exists
from typing import Dict, Any, Optional, List
from datetime import datetime
from jose import JWTError, jwt
import os
import traceback # Import traceback for detailed error logging

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists because Gunicorn worker is set to 1
online_users: Dict[str, Any] = {} # {user_id: {username, elo, sid}}
matchmaking_queue: List[Dict[str, Any]] = [] # [{user_id, elo, sid, debate_id, username}]


# --- Socket.IO Event Handlers ---
# ... (connect, user_online, user_offline, disconnect, join_matchmaking_queue, cancel_matchmaking handlers remain the same) ...
# Ensure these handlers are present from the previous correct version

# ----------------------------------------------------
# *** DEBUGGING send_message_to_human Handler ***
# ----------------------------------------------------
@sio.event
async def send_message_to_human(sid, data):
    """Handles receiving a message from a client and broadcasting it to the debate room."""
    debate_id = data.get('debateId')
    sender_id = data.get('senderId')
    content = data.get('content')
    sender_type = data.get('senderType', 'user')

    # --- Start Debugging ---
    print(f"\n--- DEBUG: send_message_to_human ---")
    print(f"SID: {sid}")
    print(f"Received Data: {data}")
    # --- End Debugging ---

    if not debate_id or sender_id is None or content is None: # Check sender_id specifically for None
        print(f"ERROR send_message_to_human: Missing data for SID {sid}. debateId={debate_id}, senderId={sender_id}, content_present={content is not None}")
        await sio.emit('error', {'detail': 'Missing message data (debateId, senderId, content).'}, room=sid)
        return

    try:
        sender_id_int = int(sender_id) # Convert sender_id early for validation
        print(f"DEBUG: Data validated. debate_id={debate_id}, sender_id_int={sender_id_int}")

        # Save message to database
        with database.SessionLocal() as db:
            print("DEBUG: Database session opened.")
            # Optional: Validate if the sender is part of the debate
            db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
            if not db_debate:
                print(f"ERROR send_message_to_human: Debate {debate_id} not found.")
                await sio.emit('error', {'detail': 'Debate not found.'}, room=sid)
                return
            print(f"DEBUG: Debate {debate_id} found. Player1={db_debate.player1_id}, Player2={db_debate.player2_id}")

            # Check if sender is player1 or player2 (if player2 exists)
            is_authorized = (db_debate.player1_id == sender_id_int) or \
                            (db_debate.player2_id is not None and db_debate.player2_id == sender_id_int)

            if not is_authorized:
                print(f"ERROR send_message_to_human: Sender {sender_id_int} not authorized for debate {debate_id}.")
                await sio.emit('error', {'detail': 'Not authorized to send message in this debate.'}, room=sid)
                return
            print(f"DEBUG: Sender {sender_id_int} is authorized.")

            # Create and save the message
            new_message_db = models.Message(
                content=content,
                sender_type=sender_type,
                debate_id=debate_id,
                sender_id=sender_id_int,
            )
            db.add(new_message_db)
            print("DEBUG: Message object created, attempting commit...")
            db.commit()
            print(f"DEBUG: Message committed successfully. ID: {new_message_db.id}")
            db.refresh(new_message_db)
            print("DEBUG: Message refreshed.")

            # Prepare message for broadcasting
            print("DEBUG: Preparing message for broadcast...")
            message_to_broadcast = schemas.MessageOut.from_orm(new_message_db).dict()
            if 'timestamp' in message_to_broadcast and isinstance(message_to_broadcast['timestamp'], datetime):
                message_to_broadcast['timestamp'] = message_to_broadcast['timestamp'].isoformat()
            print("DEBUG: Message prepared:", message_to_broadcast)

            # Broadcast the message to everyone in the debate room
            room_id = str(debate_id)
            print(f"DEBUG: Broadcasting 'new_message' to room {room_id}...")
            await sio.emit('new_message', message_to_broadcast, room=room_id)
            print(f"DEBUG: Message broadcasted successfully to room {room_id}.")
            print(f"--- END DEBUG: send_message_to_human ---")


    except Exception as e:
        # --- Enhanced Error Logging ---
        print(f"\n--- CRITICAL ERROR in send_message_to_human handler for debate {debate_id} ---")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Details: {e}")
        print("--- Traceback ---")
        traceback.print_exc() # Print the full traceback
        print("--- End Traceback ---")
        # --- End Enhanced Error Logging ---
        await sio.emit('error', {'detail': f'Server error processing message: {type(e).__name__}'}, room=sid)

# --- Placeholder for end_debate Handler ---
# ... (Ensure end_debate handler is also present) ...