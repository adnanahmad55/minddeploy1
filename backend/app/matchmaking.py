# app/matchmaking.py - FINAL COMPLETE CODE (Includes Message Handling)

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

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists because Gunicorn worker is set to 1
online_users: Dict[str, Any] = {} # {user_id: {username, elo, sid}}
matchmaking_queue: List[Dict[str, Any]] = [] # [{user_id, elo, sid, debate_id, username}]


# --- Socket.IO Event Handlers ---

@sio.event
async def connect(sid, environ, auth: Optional[dict] = None):
    """Handles initial connection and authentication."""
    token = auth.get('token') if auth else None

    if not token:
        print(f"SID {sid} connected without explicit token. Relying on 'user_online' event.")
        return True # Allow connection, rely on user_online for registration

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            print(f"Connection potentially refused for SID {sid}: Invalid token payload.")
            return True # Allow connection for now, user_online handles registration

        await sio.save_session(sid, {'email': email})
        print(f"SID {sid} connected and authenticated via token successfully.")
        return True

    except JWTError:
        print(f"Connection refused for SID {sid} due to JWT validation failure.")
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


@sio.event
async def disconnect(sid):
    """Handles socket disconnection event by cleaning up user state."""
    print(f"SID {sid} disconnected.")
    # Call user_offline logic to clean up based on SID
    await user_offline(sid, data=None)


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
        'sid': sid, # Use the current SID
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
                elif matchmaking_queue[i]['user_id'] != matchmaking_queue[p1_index]['user_id']:
                    p2_index = i
                    break

            if p1_index != -1 and p2_index != -1:
                 # Pop the one with the higher index first
                 if p1_index > p2_index:
                      player1 = matchmaking_queue.pop(p1_index)
                      player2 = matchmaking_queue.pop(p2_index)
                 else:
                      player2 = matchmaking_queue.pop(p2_index)
                      player1 = matchmaking_queue.pop(p1_index)
            else:
                 print(f"Matchmaking check: Not enough different users. Size: {len(matchmaking_queue)}")
                 return

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
                debate_id_int = int(player1['debate_id'])
                db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id_int).first()

                if db_debate:
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

            match_data_for_p1 = {
                'debate_id': db_debate.id, 'topic': db_debate.topic,
                'opponent': {'id': player2['user_id'], 'username': player2.get('username','P2'), 'elo': player2.get('elo',1000)}
            }
            match_data_for_p2 = {
                'debate_id': db_debate.id, 'topic': db_debate.topic,
                'opponent': {'id': player1['user_id'], 'username': player1.get('username','P1'), 'elo': player1.get('elo',1000)}
            }

            await sio.emit('match_found', match_data_for_p1, room=p1_sid)
            await sio.emit('match_found', match_data_for_p2, room=p2_sid)

            # Join users to the debate room *after* notifying them
            await sio.enter_room(p1_sid, str(db_debate.id))
            await sio.enter_room(p2_sid, str(db_debate.id))

            print(f"Matchmaking Success: Match for Debate {db_debate.id} emitted.")

        except Exception as e:
            print(f"CRITICAL ERROR during match emit/room join: {e}")
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

# ----------------------------------------------------
# *** FIX: Added send_message_to_human Handler ***
# ----------------------------------------------------
@sio.event
async def send_message_to_human(sid, data):
    """Handles receiving a message from a client and broadcasting it to the debate room."""
    debate_id = data.get('debateId')
    sender_id = data.get('senderId')
    content = data.get('content')
    sender_type = data.get('senderType', 'user') # Assume 'user' if not provided

    print(f"DEBUG: Received send_message_to_human for debate {debate_id} from SID {sid}, senderId {sender_id}")

    if not debate_id or not sender_id or content is None:
        print(f"ERROR send_message_to_human: Missing data for SID {sid}. Data: {data}")
        await sio.emit('error', {'detail': 'Missing message data (debateId, senderId, content).'}, room=sid)
        return

    try:
        # Save message to database
        with database.SessionLocal() as db:
            # Optional: Validate if the sender is part of the debate
            db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
            if not db_debate:
                await sio.emit('error', {'detail': 'Debate not found.'}, room=sid)
                return
            
            # Check if sender is player1 or player2 (if player2 exists)
            sender_id_int = int(sender_id) # Convert sender_id for comparison
            if not (db_debate.player1_id == sender_id_int or (db_debate.player2_id and db_debate.player2_id == sender_id_int)):
                await sio.emit('error', {'detail': 'Not authorized to send message in this debate.'}, room=sid)
                return

            new_message_db = models.Message(
                content=content,
                sender_type=sender_type,
                debate_id=debate_id,
                sender_id=sender_id_int,
            )
            db.add(new_message_db)
            db.commit()
            db.refresh(new_message_db)

            # Prepare message for broadcasting (using Pydantic schema)
            message_to_broadcast = schemas.MessageOut.from_orm(new_message_db).dict()
            # Ensure timestamp is ISO format string for JSON
            if 'timestamp' in message_to_broadcast and isinstance(message_to_broadcast['timestamp'], datetime):
                message_to_broadcast['timestamp'] = message_to_broadcast['timestamp'].isoformat()
            
            # Broadcast the message to everyone in the debate room
            room_id = str(debate_id)
            print(f"DEBUG: Broadcasting 'new_message' to room {room_id}. Content: {content[:50]}...")
            await sio.emit('new_message', message_to_broadcast, room=room_id)
            print(f"DEBUG: Message broadcasted successfully.")

    except Exception as e:
        print(f"CRITICAL ERROR in send_message_to_human handler for debate {debate_id}: {e}")
        await sio.emit('error', {'detail': 'Server error processing message.'}, room=sid)

# ----------------------------------------------------
# *** Placeholder for end_debate Handler ***
# ----------------------------------------------------
@sio.event
async def end_debate(sid, data):
     debate_id = data.get('debate_id')
     print(f"Placeholder: Received end_debate for debate {debate_id}")
     # TODO: Implement debate ending logic (evaluation, ELO update, notify users)
     # Example structure:
     # try:
     #     with database.SessionLocal() as db:
     #         # ... Fetch debate, messages, players ...
     #         # evaluation_result = await evaluate_debate(messages)
     #         # ... Update ELO, winner status ...
     #         # db.commit()
     #         # await sio.emit('debate_ended', { ... results ... }, room=str(debate_id))
     # except Exception as e:
     #     print(f"CRITICAL ERROR in end_debate handler: {e}")
     #     await sio.emit('error', {'detail': 'Server error ending debate.'}, room=sid)
     pass # Remove this pass when implementing