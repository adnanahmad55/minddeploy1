from app.socketio_instance import sio 
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
from app.evaluation import evaluate_debate # Assuming this exists
from typing import Dict, Any, Optional
from datetime import datetime
from jose import JWTError, jwt 
import os

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# Global state for matchmaking queue and online users (Safe since gunicorn -w 1 is used)
online_users: Dict[str, Any] = {} # {user_id: {username, elo, sid}}
matchmaking_queue: List[Dict[str, Any]] = [] # [{user_id, elo, sid, debate_id}]


# ... (Your existing connect and user_offline handlers remain here) ...
@sio.event
async def connect(sid, environ, auth: Optional[dict] = None):
    # ... (Auth logic to handle None and validate token) ...
    # CRITICAL FIX: Check if auth is None before trying to use .get()
    token = auth.get('token') if auth else None 
    
    if not token:
        # Allow connection but keep it unauthenticated until user_online is called
        print(f"SID {sid} connected without explicit token. Relying on 'user_online' event.")
        return True

    try:
        # JWT Validation (as defined in previous fixes)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise JWTError('Invalid payload')
        
        await sio.save_session(sid, {'email': email})
        print(f"SID {sid} connected and authenticated successfully.")
        return True
        
    except JWTError:
        print(f"Connection refused for SID {sid}: JWT validation failed.")
        raise ConnectionRefusedError('Token validation failed')

@sio.event
async def user_online(sid, data):
    # CRITICAL FIX: Always update the SID when a user sends user_online
    user_id = str(data.get('userId'))
    username = data.get('username')
    
    if user_id and username:
        online_users[user_id] = {'username': username, 'elo': data.get('elo'), 'id': user_id, 'sid': sid}
        print(f"User online: {username} (ID: {user_id}). Total: {len(online_users)}")
        # Broadcasting online users list is often needed by the UI
        # await sio.emit('online_users', list(online_users.values()))
    
@sio.event
async def user_offline(sid, data):
    user_id = str(data.get('userId'))
    if user_id in online_users:
        if online_users[user_id]['sid'] == sid: # Only disconnect if SID matches
            del online_users[user_id]
            # Also remove user from queue if they were searching
            global matchmaking_queue
            matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
            print(f"User offline: (ID: {user_id}). Total: {len(online_users)}. Queue size: {len(matchmaking_queue)}")
            # await sio.emit('online_users', list(online_users.values()))


# ----------------------------------------------------
# *** NEW CRITICAL MATCHMAKING LOGIC ***
# ----------------------------------------------------
@sio.event
async def join_matchmaking_queue(sid, data):
    user_id = str(data.get('userId'))
    debate_id = data.get('debateId') # Frontend should send the preliminary debate ID

    if not user_id or not debate_id:
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    # 1. Add user to the queue
    user_data = next((user for user in matchmaking_queue if user['user_id'] == user_id), None)
    if not user_data:
        # Get authenticated user info (assuming user_online ran)
        online_user_data = online_users.get(user_id)
        if not online_user_data:
             await sio.emit('toast', {'title': 'Error', 'description': 'Not registered as online.'}, room=sid)
             return
             
        user_data = {
            'user_id': user_id,
            'elo': online_user_data['elo'], # Using ELO for potential future matching logic
            'sid': sid,
            'debate_id': debate_id,
            'username': online_user_data['username']
        }
        matchmaking_queue.append(user_data)
        print(f"User {user_id} added to queue. Size: {len(matchmaking_queue)}")
    
    # 2. Check for an immediate match
    # CRITICAL: We need at least 2 people in the queue
    if len(matchmaking_queue) >= 2:
        
        # Simple FIFO matching (first in, first out)
        player1 = matchmaking_queue.pop(0) # The first user waiting
        player2 = matchmaking_queue.pop(0) # The current user (or next waiting)
        
        print(f"Match Found: {player1['username']} vs {player2['username']}")

        # 3. Update the debate in the database (set player2_id)
        try:
            with database.SessionLocal() as db:
                # Find the debate created by Player 1
                db_debate = db.query(models.Debate).filter(models.Debate.id == player1['debate_id']).first()

                if db_debate:
                    # Update player 2's ID and commit
                    db_debate.player2_id = int(player2['user_id']) # Player 2 is opponent
                    # Update the debate ID for player 2's object if needed, but here we update P1's debate.
                    db.commit()
                else:
                    print(f"WARNING: Debate {player1['debate_id']} not found for matchmaking update.")
                    return # Or handle reconnection logic
                    
        except Exception as e:
            print(f"CRITICAL DB ERROR during matchmaking: {e}")
            return

        # 4. Notify both users about the match
        
        # Prepare data for both users
        match_data_for_p1 = {
            'debate_id': db_debate.id,
            'topic': db_debate.topic,
            'opponent': {'id': player2['user_id'], 'username': player2['username'], 'elo': player2['elo']}
        }
        match_data_for_p2 = {
            'debate_id': db_debate.id,
            'topic': db_debate.topic,
            'opponent': {'id': player1['user_id'], 'username': player1['username'], 'elo': player1['elo']}
        }

        # Emit to both SIDs
        await sio.emit('match_found', match_data_for_p1, room=player1['sid'])
        await sio.emit('match_found', match_data_for_p2, room=player2['sid'])
        
        # Join both users into the debate room immediately
        await sio.enter_room(player1['sid'], str(db_debate.id))
        await sio.enter_room(player2['sid'], str(db_debate.id))
        
        print(f"Matchmaking Success: Match for Debate {db_debate.id} emitted.")

@sio.event
async def cancel_matchmaking(sid, data):
    user_id = str(data.get('userId'))
    global matchmaking_queue
    # Remove user from the queue
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
    print(f"User {user_id} removed from queue. Size: {len(matchmaking_queue)}")
    
    
# ... (Your other handlers like challenge_user, accept_challenge, decline_challenge, 
# send_message_to_human, end_debate remain unchanged below) ...

@sio.event
async def challenge_user(sid, data):
    # ... (Your existing challenge_user logic) ...
    # This logic may become redundant if using a queue-based system

    challenger = data.get('challenger')
    opponent_id = str(data.get('opponentId'))
    topic = data.get('topic')

    opponent_sid = online_users.get(opponent_id, {}).get('sid')
    if opponent_sid:
        await sio.emit('challenge_received', {'challenger': challenger, 'topic': topic}, room=opponent_sid)
        print(f"Challenge sent from {challenger['username']} to {online_users[opponent_id]['username']}")
    else:
        await sio.emit('toast', {'title': 'Opponent Offline', 'description': 'The user you challenged is no longer online.', 'variant': 'destructive'}, room=sid)

@sio.event
async def accept_challenge(sid, data):
    # ... (Your existing accept_challenge logic) ...
    pass # Keeping this for direct challenge method

@sio.event
async def decline_challenge(sid, data):
    # ... (Your existing decline_challenge logic) ...
    pass # Keeping this for direct challenge method

@sio.event
async def send_message_to_human(sid, data):
    # ... (Your existing send_message_to_human logic) ...
    pass

@sio.event
async def end_debate(sid, data):
    # ... (Your existing end_debate logic) ...
    pass