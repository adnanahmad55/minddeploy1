from app.socketio_instance import sio 

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app import database, models, schemas
from app.evaluation import evaluate_debate # Assuming this exists
from typing import Dict, Any, Optional
from datetime import datetime
from jose import JWTError, jwt 
import os

# Assuming SECRET_KEY and ALGORITHM are defined in auth.py
SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

online_users: Dict[str, Any] = {}

# --- FIX: Socket.IO Connect Handler (Handles None for 'auth') ---
@sio.event
async def connect(sid, environ, auth: Optional[dict] = None):
    # CRITICAL FIX: Check if auth is None before trying to use .get()
    token = auth.get('token') if auth else None 
    
    if not token:
        # User must send a token (or we let the connection pass if auth is optional globally)
        # For authenticated access, we must raise ConnectionRefusedError
        if environ.get('HTTP_AUTHORIZATION'):
             print(f"Connection attempt for SID {sid}: Auth token missing/invalid format.")
             # We rely on user_online event to register the user
        else:
             # Allow connection but keep it unauthenticated until user_online is called
             print(f"SID {sid} connected without explicit token. Relying on 'user_online' event.")
             return True

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise JWTError('Invalid payload')
        
        # Store authenticated email in the session
        await sio.save_session(sid, {'email': email})
        print(f"SID {sid} connected and authenticated successfully.")
        return True
        
    except JWTError:
        print(f"Connection refused for SID {sid}: JWT validation failed.")
        raise ConnectionRefusedError('Token validation failed')

# --- END CONNECT HANDLER FIX ---

# NOTE: @sio.event disconnect must also be implemented to remove users from rooms/online_users list.

@sio.event
async def user_online(sid, data):
    # Ensures user is registered with their session ID
    user_id = str(data.get('userId'))
    if not user_id:
        print(f"WARNING: User ID missing in user_online event for SID {sid}.")
        return

    # Check if user is already registered under a different SID (e.g., if they reconnected)
    if user_id not in online_users or online_users[user_id]['sid'] != sid:
        online_users[user_id] = {'username': data.get('username'), 'elo': data.get('elo'), 'id': user_id, 'sid': sid}
        print(f"User online: {data.get('username')} (ID: {user_id}). Total: {len(online_users)}")
        await sio.emit('online_users', list(online_users.values()))

@sio.event
async def user_offline(sid, data):
    user_id = str(data.get('userId'))
    if user_id in online_users:
        if online_users[user_id]['sid'] == sid:
            del online_users[user_id]
            print(f"User offline: (ID: {user_id}). Total: {len(online_users)}")
            await sio.emit('online_users', list(online_users.values()))
    
# NOTE: Other handlers (challenge_user, accept_challenge, send_message_to_human, etc.) remain below...

@sio.event
async def challenge_user(sid, data):
    # ... (Your challenge_user logic) ...
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
    # ... (Your accept_challenge logic) ...
    challenger_id = str(data.get('challengerId'))
    opponent_data = data.get('opponent')
    topic = data.get('topic')
    debate_id = data.get('debateId')

    challenger_sid = online_users.get(challenger_id, {}).get('sid')

    if challenger_sid and debate_id:
        await sio.enter_room(sid, str(debate_id))
        await sio.enter_room(challenger_sid, str(debate_id))
        await sio.emit('challenge_accepted', {'opponent': opponent_data, 'topic': topic, 'debateId': debate_id}, room=challenger_sid)
        print(f"Challenge accepted by {opponent_data['username']} from {online_users[challenger_id]['username']}. Debate ID: {debate_id}. Users joined room {debate_id}")

@sio.event
async def decline_challenge(sid, data):
    # ... (Your decline_challenge logic) ...
    challenger_id = str(data.get('challengerId'))
    challenger_sid = online_users.get(challenger_id, {}).get('sid')
    if challenger_sid:
        await sio.emit('challenge_declined', {'opponentId': sid}, room=challenger_sid)
        await sio.emit('toast', {'title': 'Challenge Declined', 'description': 'Your debate challenge was declined.'}, room=challenger_sid)
        print(f"Challenge declined by {sid} to {online_users[challenger_id]['username']}")

@sio.event
async def send_message_to_human(sid, data):
    # ... (Your send_message_to_human logic) ...
    debate_id = data.get('debateId')
    sender_id = data.get('senderId')
    content = data.get('content')
    sender_type = data.get('senderType', 'user')

    try:
        # NOTE: Using database.SessionLocal() requires the database connection to be initialized correctly.
        with database.SessionLocal() as db:
            db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()
            if not db_debate:
                await sio.emit('error', {'detail': 'Debate not found.'}, room=sid)
                return
            
            if not (db_debate.player1_id == sender_id or db_debate.player2_id == sender_id):
                await sio.emit('error', {'detail': 'Not authorized to send message in this debate.'}, room=sid)
                return

            new_message_db = models.Message(
                content=content,
                sender_type=sender_type,
                debate_id=debate_id,
                sender_id=sender_id,
            )
            db.add(new_message_db)
            db.commit()
            db.refresh(new_message_db)

            # --- FIX: Removed Duplicate Emit ---
            message_to_broadcast = schemas.MessageOut.from_orm(new_message_db).dict()
            if 'timestamp' in message_to_broadcast and isinstance(message_to_broadcast['timestamp'], datetime):
                message_to_broadcast['timestamp'] = message_to_broadcast['timestamp'].isoformat()
            
            print(f"DEBUG: Emitting 'new_message' to room {debate_id} with content: {message_to_broadcast.get('content')[:50]}...")
            await sio.emit('new_message', message_to_broadcast, room=str(debate_id))
            # --- END FIX ---

    except Exception as e:
        print(f"CRITICAL ERROR in send_message_to_human handler: {e}")
        await sio.emit('error', {'detail': 'Server error during message processing.'}, room=sid)

@sio.event
async def end_debate(sid, data):
    # ... (Your end_debate logic) ...
    debate_id = data.get('debate_id')
    print(f"Ending debate with ID: {debate_id}")

    try:
        with database.SessionLocal() as db:
            db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id).first()

            if not db_debate:
                await sio.emit('error', {'detail': 'Debate not found.'}, room=sid)
                return

            messages = db.query(models.Message).filter(models.Message.debate_id == debate_id).all()
            
            evaluation_result = await evaluate_debate(messages)
            winner_id = evaluation_result.get('winner_id')
            result = evaluation_result.get('result')
            feedback = evaluation_result.get('feedback', {})
            score = evaluation_result.get('score', 50)
            elo_change = 0

            player1 = db.query(models.User).filter(models.User.id == db_debate.player1_id).first()
            player2 = db.query(models.User).filter(models.User.id == db_debate.player2_id).first()
            
            if not player1:
                db_debate.winner = "Error"
                db.commit()
                await sio.emit('error', {'detail': 'Player data not found.'}, room=str(debate_id))
                return

            if result == 'User':
                winning_player = player1 if winner_id == player1.id else player2
                losing_player = player1 if winner_id != player1.id else player2
                elo_change = evaluation_result.get('elo_change', 10)
                winning_player.elo += elo_change
                winning_player.mind_tokens += 5
                if losing_player:
                    losing_player.elo -= elo_change
                db_debate.winner = winning_player.username
            elif result == 'AI':
                # FIX: simplified AI winning logic
                losing_player = player1 # Assuming only player1 is human, since player2 can be None
                elo_change = evaluation_result.get('elo_change', 10)
                losing_player.elo -= elo_change
                db_debate.winner = "AI Bot"
            elif result == 'Draw':
                db_debate.winner = "Draw"
            else:
                db_debate.winner = "Undetermined"
            
            db.commit()

            await sio.emit('debate_ended', {
                'debate_id': debate_id,
                'winner': db_debate.winner,
                'elo_change': elo_change,
                'feedback': feedback,
                'score': score
            }, room=str(debate_id))

    except Exception as e:
        print(f"CRITICAL ERROR in end_debate handler for debate {debate_id}: {e}")
        await sio.emit('error', {'detail': 'Server error during debate evaluation.'}, room=sid)