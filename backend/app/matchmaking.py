from app.socketio_instance import sio 
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
from typing import Dict, Any, Optional, List
import os
from jose import JWTError, jwt 

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists
online_users: Dict[str, Any] = {}
matchmaking_queue: List[Dict[str, Any]] = []

# ... (connect, user_online, user_offline handlers remain here) ...

@sio.event
async def join_matchmaking_queue(sid, data):
    user_id = str(data.get('userId'))
    debate_id = data.get('debateId') 

    if not user_id or not debate_id:
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    global matchmaking_queue
    
    # Remove user if they are restarting the search
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]

    online_user_data = online_users.get(user_id)
    if not online_user_data:
        await sio.emit('toast', {'title': 'Error', 'description': 'Not registered as online.'}, room=sid)
        return
            
    user_data = {
        'user_id': user_id,
        'elo': online_user_data.get('elo', 1000), 
        'sid': sid,
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
            # CRITICAL FIX: Ensure two *different* users are popped
            p1_temp = matchmaking_queue.pop(0) 
            # Find the next user who is NOT player 1
            p2_index = -1
            for i, user in enumerate(matchmaking_queue):
                if user['user_id'] != p1_temp['user_id']:
                    p2_index = i
                    break
            
            # If a different user is found, pop them
            if p2_index != -1:
                 player1 = p1_temp # Confirm player 1
                 player2 = matchmaking_queue.pop(p2_index) # Pop player 2
            else:
                 # If only the same user is in the queue multiple times (or only one user left)
                 matchmaking_queue.insert(0, p1_temp) # Put player 1 back
                 print(f"Matchmaking check: Not enough different users in queue. Size: {len(matchmaking_queue)}")
                 return # Wait for another user
                 
        except IndexError:
            print("WARNING: IndexError during pop, should not happen if size >= 2.")
            if player1: matchmaking_queue.insert(0, player1) 
            return 
        
        # --- Continue only if player1 and player2 are different users ---
        if not player1 or not player2 or player1['user_id'] == player2['user_id']:
             print("ERROR: Matchmaking failed, same user or invalid players.")
             # Re-queue if possible
             if player1: matchmaking_queue.insert(0, player1)
             if player2: matchmaking_queue.insert(0, player2)
             return

        print(f"Match Found: {player1.get('username', 'P1')} vs {player2.get('username', 'P2')}")

        # 3. Update the debate in the database (set player2_id)
        # ... (DB update logic remains the same) ...
        db_debate = None # Initialize db_debate
        try:
            with database.SessionLocal() as db:
                debate_id_int = int(player1['debate_id']) 
                db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id_int).first()

                if db_debate:
                    db_debate.player2_id = int(player2['user_id']) 
                    db.commit()
                    db.refresh(db_debate)
                else:
                    matchmaking_queue.insert(0, player1) # Re-add players if debate not found
                    matchmaking_queue.insert(0, player2) 
                    print(f"WARNING: Debate {player1.get('debate_id', 'N/A')} not found. Players re-queued.")
                    return 
                    
        except Exception as e:
            print(f"CRITICAL DB ERROR during matchmaking update: {e}")
            matchmaking_queue.insert(0, player1) # Re-add players on DB error
            matchmaking_queue.insert(0, player2) 
            return

        # 4. Notify both users about the match
        # ... (Emit logic remains the same, assuming player1 and player2 data is valid) ...
        try:
            p1_sid = player1.get('sid')
            p2_sid = player2.get('sid')
            if not p1_sid or not p2_sid:
                 raise ValueError("Missing SID for emit") # Trigger safety net

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