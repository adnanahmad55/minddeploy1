# app/matchmaking.py - FINAL COMPLETE CODE (All Handlers Included)
from fastapi import APIRouter
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
import traceback # For detailed error logging

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists because Gunicorn worker is set to 1
online_users: Dict[str, Any] = {} # {user_id: {username, elo, sid}}
matchmaking_queue: List[Dict[str, Any]] = [] # [{user_id, elo, sid, debate_id, username}]
router = APIRouter()

# --- Socket.IO Event Handlers ---

@sio.event
async def connect(sid, environ, auth: Optional[dict] = None):
    """Handles initial connection and authentication."""
    token = auth.get('token') if auth else None

    if not token:
        print(f"SID {sid} connected without explicit token. Waiting for 'user_online'.")
        return True # Allow connection

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            print(f"SID {sid} connection allowed but token payload invalid.")
            return True # Allow connection for now

        # Store authenticated email in the session for potential future use
        await sio.save_session(sid, {'email': email})
        print(f"SID {sid} connected and authenticated via token successfully.")
        return True

    except JWTError:
        print(f"SID {sid} connection allowed despite JWT validation failure.")
        return True # Allow connection for now


@sio.event
async def user_online(sid, data):
    """Registers user details when they explicitly declare themselves online."""
    user_id = str(data.get('userId'))
    username = data.get('username')
    elo = data.get('elo')

    if user_id and username:
        # Always update the user's entry with the latest SID
        online_users[user_id] = {'username': username, 'elo': elo, 'id': user_id, 'sid': sid}
        print(f"User online: {username} (ID: {user_id}, ELO: {elo}). Total online: {len(online_users)}")
        # Optionally broadcast the updated online users list if UI needs it
        # await sio.emit('online_users', list(online_users.values()))
    else:
        print(f"WARNING: Missing userId or username in user_online event for SID {sid}. Data: {data}")


@sio.event
async def user_offline(sid, data=None):
    """Handles user going offline or disconnecting based on SID."""
    user_id_to_remove = None
    username = "Unknown"
    # Find user_id based on sid
    for uid, udata in list(online_users.items()): # Use list() for safe iteration during removal
        if udata.get('sid') == sid:
            user_id_to_remove = uid
            username = udata.get('username', 'Unknown')
            break

    if user_id_to_remove:
        if user_id_to_remove in online_users:
             del online_users[user_id_to_remove]
        # Also remove user from queue if they were searching
        global matchmaking_queue
        matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id_to_remove]
        print(f"User offline: {username} (ID: {user_id_to_remove}). Total online: {len(online_users)}. Queue size: {len(matchmaking_queue)}")
        # Optionally broadcast the updated online users list
        # await sio.emit('online_users', list(online_users.values()))


@sio.event
async def disconnect(sid):
    """Handles socket disconnection event by cleaning up user state."""
    print(f"SID {sid} disconnected.")
    # Call user_offline logic to clean up based on SID
    await user_offline(sid, data=None)


# --- Room Join Handler ---
@sio.event
async def join_debate_room(sid, data):
    """Handles a client joining a specific debate room."""
    debate_id = data.get('debateId')
    if debate_id:
        room_id = str(debate_id)
        try:
            await sio.enter_room(sid, room_id)
            print(f"DEBUG: SID {sid} joined room {room_id}")
        except Exception as e:
            print(f"ERROR: Failed to join room {room_id} for SID {sid}. Error: {e}")
            await sio.emit('error', {'detail': f'Failed to join debate room: {e}'}, room=sid)
    else:
        print(f"WARNING: join_debate_room called without debateId for SID {sid}")

@sio.event
async def leave_debate_room(sid, data):
    """Handles a client leaving a specific debate room."""
    debate_id = data.get('debateId')
    if debate_id:
        room_id = str(debate_id)
        try:
             await sio.leave_room(sid, room_id)
             print(f"DEBUG: SID {sid} left room {room_id}")
        except Exception as e:
             print(f"ERROR: Failed to leave room {room_id} for SID {sid}. Error: {e}")
             # No need to emit error on leave typically
    else:
        print(f"WARNING: leave_debate_room called without debateId for SID {sid}")


# --- Matchmaking Queue Logic ---

@sio.event
async def join_matchmaking_queue(sid, data):
    """Adds a user to the matchmaking queue and attempts to find a match."""
    print(f"DEBUG: Received join_matchmaking_queue from SID {sid} with data: {data}")

    user_id = str(data.get('userId'))
    debate_id = data.get('debateId')

    if not user_id or not debate_id:
        print(f"ERROR join_matchmaking_queue: Missing userId or debateId for SID {sid}")
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    global matchmaking_queue

    # Ensure user is registered as online and SID matches before proceeding
    online_user_data = online_users.get(user_id)
    if not online_user_data or online_user_data.get('sid') != sid:
        print(f"ERROR join_matchmaking_queue: User {user_id} not online or SID mismatch for SID {sid}")
        await sio.emit('toast', {'title': 'Error', 'description': 'Not properly registered as online or session mismatch.'}, room=sid)
        return

    # Remove user if they are restarting the search
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]

    # Add user to the queue
    user_data = {
        'user_id': user_id,
        'elo': online_user_data.get('elo', 1000),
        'sid': sid, # Use the current SID from the event
        'debate_id': debate_id,
        'username': online_user_data.get('username', 'Unknown')
    }
    matchmaking_queue.append(user_data)
    print(f"User {user_data['username']} added to queue. Size: {len(matchmaking_queue)}")

    # Check for an immediate match
    if len(matchmaking_queue) >= 2:
        player1 = None
        player2 = None
        try:
            # Find the first two users with different IDs
            p1_index = -1
            p2_index = -1
            for i in range(len(matchmaking_queue)):
                if p1_index == -1:
                    p1_index = i
                # Check if current user is different from the one at p1_index
                elif matchmaking_queue[i].get('user_id') != matchmaking_queue[p1_index].get('user_id'):
                    p2_index = i
                    break # Found two different users

            if p1_index != -1 and p2_index != -1:
                 # Pop the one with the higher index first to avoid shifting issues
                 if p1_index > p2_index:
                      player1 = matchmaking_queue.pop(p1_index)
                      player2 = matchmaking_queue.pop(p2_index)
                 else:
                      player2 = matchmaking_queue.pop(p2_index)
                      player1 = matchmaking_queue.pop(p1_index)
            else:
                 # Not enough different users
                 print(f"Matchmaking check: Not enough different users in queue. Size: {len(matchmaking_queue)}")
                 return # Wait for another different user

        except IndexError:
            print("WARNING: IndexError during pop.")
            if player1: matchmaking_queue.insert(0, player1)
            if player2: matchmaking_queue.insert(0, player2)
            return

        # Double check players are valid
        if not player1 or not player2 or player1.get('user_id') == player2.get('user_id'):
             print("ERROR: Matchmaking failed after pop.")
             if player1: matchmaking_queue.insert(0, player1)
             if player2: matchmaking_queue.insert(0, player2)
             return

        print(f"Match Found: {player1.get('username', 'P1')} vs {player2.get('username', 'P2')}")

        # Update the debate in the database
        db_debate = None
        try:
            with database.SessionLocal() as db:
                # Use player1's debate_id as it was created first by the API call
                debate_id_int = int(player1['debate_id'])
                db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id_int).first()

                if db_debate:
                    # Update player2_id for the debate initiated by player1
                    db_debate.player2_id = int(player2['user_id'])
                    db.commit()
                    db.refresh(db_debate)
                else:
                    matchmaking_queue.insert(0, player1)
                    matchmaking_queue.insert(0, player2)
                    print(f"WARNING: Debate {player1.get('debate_id', 'N/A')} not found. Players re-queued.")
                    return

        except Exception as e:
            print(f"CRITICAL DB ERROR during matchmaking update: {e}")
            matchmaking_queue.insert(0, player1)
            matchmaking_queue.insert(0, player2)
            return

        # Notify both users about the match
        try:
            p1_sid = player1.get('sid')
            p2_sid = player2.get('sid')
            if not p1_sid or not p2_sid: raise ValueError("Missing SID for emit")

            # Data structure for the 'match_found' event
            match_data_for_p1 = {
                'debate_id': db_debate.id, 'topic': db_debate.topic,
                'opponent': {'id': player2['user_id'], 'username': player2.get('username','P2'), 'elo': player2.get('elo',1000)}
            }
            match_data_for_p2 = {
                'debate_id': db_debate.id, 'topic': db_debate.topic,
                'opponent': {'id': player1['user_id'], 'username': player1.get('username','P1'), 'elo': player1.get('elo',1000)}
            }

            # Emit 'match_found' to both players specifically
            await sio.emit('match_found', match_data_for_p1, room=p1_sid)
            await sio.emit('match_found', match_data_for_p2, room=p2_sid)

            # Join users to the Socket.IO room for the debate *after* they receive match_found
            await sio.enter_room(p1_sid, str(db_debate.id))
            await sio.enter_room(p2_sid, str(db_debate.id))

            print(f"Matchmaking Success: Match for Debate {db_debate.id} emitted. Players joined room.")

        except Exception as e:
            print(f"CRITICAL ERROR during match emit/room join: {e}")
            # Attempt to re-queue players if emit/join fails
            matchmaking_queue.insert(0, player1)
            matchmaking_queue.insert(0, player2)


@sio.event
async def cancel_matchmaking(sid, data):
    """Removes a user from the matchmaking queue."""
    user_id = str(data.get('userId'))
    global matchmaking_queue
    original_size = len(matchmaking_queue)
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
    if len(matchmaking_queue) < original_size:
        print(f"User {user_id} removed from queue. Size: {len(matchmaking_queue)}")


# --- Message Handling ---
@sio.event
async def send_message_to_human(sid, data):
    """Handles receiving a message from a client and broadcasting it to the debate room."""
    debate_id = data.get('debateId')
    sender_id = data.get('senderId')
    content = data.get('content')
    sender_type = data.get('senderType', 'user')

    print(f"\n--- DEBUG: send_message_to_human ---")
    print(f"SID: {sid}")
    print(f"Received Data: {data}")

    if not debate_id or sender_id is None or content is None:
        print(f"ERROR send_message_to_human: Missing data.")
        await sio.emit('error', {'detail': 'Missing message data.'}, room=sid)
        return

    try:
        sender_id_int = int(sender_id)
        print(f"DEBUG: Data validated.")

        with database.SessionLocal() as db:
            print("DEBUG: DB session opened.")
            db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
            if not db_debate:
                print(f"ERROR: Debate {debate_id} not found.")
                await sio.emit('error', {'detail': 'Debate not found.'}, room=sid)
                return
            print(f"DEBUG: Debate {debate_id} found.")

            # Authorization check
            is_authorized = (db_debate.player1_id == sender_id_int) or \
                            (db_debate.player2_id is not None and db_debate.player2_id == sender_id_int)
            if not is_authorized:
                print(f"ERROR: Sender {sender_id_int} not authorized.")
                await sio.emit('error', {'detail': 'Not authorized.'}, room=sid)
                return
            print(f"DEBUG: Sender {sender_id_int} authorized.")

            # Save message
            new_message_db = models.Message(
                content=content, sender_type=sender_type,
                debate_id=debate_id, sender_id=sender_id_int,
            )
            db.add(new_message_db)
            db.commit()
            db.refresh(new_message_db)
            print(f"DEBUG: Message committed. ID: {new_message_db.id}")

            # Prepare message for broadcasting
            message_to_broadcast = schemas.MessageOut.from_orm(new_message_db).dict()
            if 'timestamp' in message_to_broadcast and isinstance(message_to_broadcast['timestamp'], datetime):
                message_to_broadcast['timestamp'] = message_to_broadcast['timestamp'].isoformat()
            print("DEBUG: Message prepared:", message_to_broadcast)

            # Broadcast to the specific debate room
            room_id = str(debate_id)
            print(f"DEBUG: Broadcasting 'new_message' to room {room_id}...")
            await sio.emit('new_message', message_to_broadcast, room=room_id) # <<< EMIT TO ROOM
            print(f"DEBUG: Message broadcasted successfully.")

    except Exception as e:
        print(f"\n--- CRITICAL ERROR in send_message_to_human ---")
        traceback.print_exc()
        await sio.emit('error', {'detail': f'Server error: {type(e).__name__}'}, room=sid)

# --- Placeholder for end_debate ---
@sio.event
async def end_debate(sid, data):
     debate_id = data.get('debate_id')
     print(f"Placeholder: Received end_debate for debate {debate_id}")
     # TODO: Implement debate ending logic (evaluation, ELO update, etc.)
     pass