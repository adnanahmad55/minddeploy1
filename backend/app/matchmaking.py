from app.socketio_instance import sio 
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
from typing import Dict, Any, Optional, List
import os

SECRET_KEY = os.getenv("JWT_SECRET", "testsecret")
ALGORITHM = "HS256"

# NOTE: These are safe Global lists
online_users: Dict[str, Any] = {}
matchmaking_queue: List[Dict[str, Any]] = []

# ... (connect, user_online, user_offline handlers are assumed to be correct) ...

@sio.event
async def join_matchmaking_queue(sid, data):
    user_id = str(data.get('userId'))
    debate_id = data.get('debateId') 

    if not user_id or not debate_id:
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    global matchmaking_queue
    
    # CRITICAL FIX 1: Remove user if they are restarting the search
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
        'username': online_user_data['username']
    }
    matchmaking_queue.append(user_data)
    print(f"User {user_data['username']} added to queue. Size: {len(matchmaking_queue)}")
    
    # 2. Check for an immediate match
    # CRITICAL FIX: Ensure the queue has AT LEAST 2 members before popping.
    if len(matchmaking_queue) >= 2:
        
        # NOTE: Both pops are now safe because len >= 2
        player1 = matchmaking_queue.pop(0) 
        player2 = matchmaking_queue.pop(0) 
        
        print(f"Match Found: {player1['username']} vs {player2['username']}")

        # 3. Update the debate in the database (set player2_id)
        try:
            with database.SessionLocal() as db:
                debate_id_int = int(player1['debate_id']) 
                db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id_int).first()

                if db_debate:
                    db_debate.player2_id = int(player2['user_id']) 
                    db.commit()
                else:
                    # If debate creation API failed, re-add players to queue
                    matchmaking_queue.append(player1)
                    matchmaking_queue.append(player2)
                    print(f"WARNING: Debate {player1['debate_id']} not found for matchmaking update.")
                    return 
                    
        except Exception as e:
            print(f"CRITICAL DB ERROR during matchmaking update: {e}")
            # Re-add both players to queue if DB commit failed
            matchmaking_queue.append(player1)
            matchmaking_queue.append(player2)
            return

        # 4. Notify both users about the match
        
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
    # ... (Your cancel_matchmaking logic) ...
    user_id = str(data.get('userId'))
    global matchmaking_queue
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
    print(f"User {user_id} removed from queue. Size: {len(matchmaking_queue)}")
    
    
# NOTE: Other handlers like connect, user_online, user_offline, challenge_user, accept_challenge, end_debate are omitted for brevity.
# Ensure they are present in your final file.