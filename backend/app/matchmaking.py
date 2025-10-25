from app.socketio_instance import sio
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
from app.evaluation import evaluate_debate # Assuming this exists
from typing import Dict, Any, Optional, List
from datetime import datetime
from jose import JWTError, jwt
import os

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists
online_users: Dict[str, Any] = {}
matchmaking_queue: List[Dict[str, Any]] = []

# ... (connect, user_online, user_offline handlers remain here) ...

# ----------------------------------------------------
# *** FINAL DEBUGGING CHECK ***
# ----------------------------------------------------
@sio.event
async def join_matchmaking_queue(sid, data):
    # --- ADD THIS PRINT STATEMENT ---
    print(f"DEBUG: Received join_matchmaking_queue from SID {sid} with data: {data}")
    # --- END ADD ---

    user_id = str(data.get('userId'))
    debate_id = data.get('debateId')

    if not user_id or not debate_id:
        print(f"ERROR join_matchmaking_queue: Missing userId or debateId for SID {sid}")
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    global matchmaking_queue

    # Remove user if they are restarting the search
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]

    online_user_data = online_users.get(user_id)
    if not online_user_data:
        print(f"ERROR join_matchmaking_queue: User {user_id} not found in online_users for SID {sid}")
        await sio.emit('toast', {'title': 'Error', 'description': 'Not registered as online.'}, room=sid)
        return

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
            # Pop two DIFFERENT users
            p1_temp = matchmaking_queue.pop(0)
            p2_index = -1
            for i, user in enumerate(matchmaking_queue):
                if user['user_id'] != p1_temp['user_id']:
                    p2_index = i
                    break

            if p2_index != -1:
                 player1 = p1_temp
                 player2 = matchmaking_queue.pop(p2_index)
            else:
                 matchmaking_queue.insert(0, p1_temp)
                 print(f"Matchmaking check: Not enough different users. Size: {len(matchmaking_queue)}")
                 return

        except IndexError:
            print("WARNING: IndexError during pop, despite size check.")
            if player1: matchmaking_queue.insert(0, player1)
            return

        if not player1 or not player2 or player1['user_id'] == player2['user_id']:
             print("ERROR: Matchmaking failed, same user or invalid players.")
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
            if not p1_sid or not p2_sid:
                 raise ValueError("Missing SID for emit")

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

            await sio.enter_room(p1_sid, str(db_debate.id))
            await sio.enter_room(p2_sid, str(db_debate.id))

            print(f"Matchmaking Success: Match for Debate {db_debate.id} emitted.")

        except Exception as e:
            print(f"CRITICAL ERROR during match emit/room join: {e}")
            matchmaking_queue.insert(0, player1)
            matchmaking_queue.insert(0, player2)


@sio.event
async def cancel_matchmaking(sid, data):
    # ... (Your cancel_matchmaking logic) ...
    user_id = str(data.get('userId'))
    global matchmaking_queue
    original_size = len(matchmaking_queue)
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
    if len(matchmaking_queue) < original_size:
        print(f"User {user_id} removed from queue. Size: {len(matchmaking_queue)}")


# NOTE: Other handlers like connect, user_online, user_offline, end_debate are omitted for brevity.
# Ensure they are present in your final file.