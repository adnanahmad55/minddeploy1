# Corrected import for sibling module
from .socketio_instance import sio 

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from . import database, models, schemas
from . evaluation import evaluate_debate
from typing import Dict, Any
from datetime import datetime
from jose import JWTError, jwt # <<< ADDED for token validation

# Assuming SECRET_KEY and ALGORITHM are defined in auth.py or available via env vars
# Since we don't have auth.py content accessible here, we'll import required logic if possible
# FALLBACK: Define the required constant if not importable
import os
SECRET_KEY = os.getenv("JWT_SECRET", "testsecret") # Ensure this matches auth.py
ALGORITHM = "HS256" # Ensure this matches auth.py


online_users: Dict[str, Any] = {}

# --- ADDED: Socket.IO Connect Handler for Token Validation (Fixes 403) ---
@sio.event
async def connect(sid, environ, auth):
    token = auth.get('token')
    if not token:
        # User must send a token
        print(f"Connection refused for SID {sid}: No token provided.")
        raise ConnectionRefusedError('Authentication token missing')

    try:
        # Validate the token using the same logic as FastAPI auth
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            print(f"Connection refused for SID {sid}: Invalid payload.")
            raise ConnectionRefusedError('Invalid authentication payload')
        
        # Optionally, fetch user details and store them in the session
        # For simplicity, we trust the token payload for now.
        
        print(f"SID {sid} connected and authenticated successfully.")
        # We can store the authenticated email in the session for later use
        await sio.save_session(sid, {'email': email})
        
    except JWTError:
        print(f"Connection refused for SID {sid}: JWT validation failed.")
        raise ConnectionRefusedError('Token validation failed')

# --- END ADDED CONNECT HANDLER ---


@sio.event
async def user_online(sid, data):
    # This handler is called only AFTER the 'connect' handler succeeds
    # ... (rest of the logic remains the same)
    user_id = str(data.get('userId'))
    if user_id not in online_users:
        online_users[user_id] = {'username': data.get('username'), 'elo': data.get('elo'), 'id': user_id, 'sid': sid}
        print(f"User online: {data.get('username')} (ID: {user_id})")
        await sio.emit('online_users', list(online_users.values()))

@sio.event
async def user_offline(sid, data):
    user_id = str(data.get('userId'))
    if user_id in online_users:
        del online_users[user_id]
        print(f"User offline: (ID: {user_id})")
        await sio.emit('online_users', list(online_users.values()))

@sio.event
async def challenge_user(sid, data):
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
    challenger_id = str(data.get('challengerId'))
    challenger_sid = online_users.get(challenger_id, {}).get('sid')
    if challenger_sid:
        await sio.emit('challenge_declined', {'opponentId': sid}, room=challenger_sid)
        await sio.emit('toast', {'title': 'Challenge Declined', 'description': 'Your debate challenge was declined.'}, room=challenger_sid)
        print(f"Challenge declined by {sid} to {online_users[challenger_id]['username']}")

@sio.event
async def send_message_to_human(sid, data):
    debate_id = data.get('debateId')
    sender_id = data.get('senderId')
    content = data.get('content')
    sender_type = data.get('senderType', 'user')

    try:
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
            
            if not player1 or not player2:
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
                losing_player.elo -= elo_change
                db_debate.winner = winning_player.username
            elif result == 'AI':
                # FIX: simplified AI winning logic
                winning_player_id = 0 # This line is unnecessary but harmless
                losing_player = player1 if player1.id != 0 else player2 # Assuming AI_USER_ID is 0 or 1
                elo_change = evaluation_result.get('elo_change', 10)
                # Apply ELO change to the human player who lost
                losing_player = player1 if db_debate.player1_id != winner_id else player2 
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
