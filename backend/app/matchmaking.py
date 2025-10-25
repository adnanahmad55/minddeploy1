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
        'elo': online_user_data.get('elo', 1000), # Default ELO if missing
        'sid': sid,
        'debate_id': debate_id, 
        'username': online_user_data.get('username', 'Unknown') # Default username
    }
    matchmaking_queue.append(user_data)
    print(f"User {user_data['username']} added to queue. Size: {len(matchmaking_queue)}")
    
    # Check for an immediate match
    if len(matchmaking_queue) >= 2:
        
        player1 = None
        player2 = None
        
        try:
            player1 = matchmaking_queue.pop(0) 
            player2 = matchmaking_queue.pop(0) 
        except IndexError:
            print("WARNING: IndexError during pop, should not happen if size >= 2.")
            # Re-add players if one was popped but not the other (unlikely but safe)
            if player1: matchmaking_queue.insert(0, player1) 
            return 
        
        print(f"Match Found: {player1.get('username', 'P1')} vs {player2.get('username', 'P2')}")

        # Update the debate in the database
        db_debate = None # Initialize db_debate
        try:
            with database.SessionLocal() as db:
                debate_id_int = int(player1['debate_id']) 
                db_debate = db.query(models.Debate).filter(models.Debate.id == debate_id_int).first()

                if db_debate:
                    db_debate.player2_id = int(player2['user_id']) 
                    db.commit()
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

        # Notify both users about the match - CRITICAL FIX: Validate data before emitting
        try:
            # Safely get required data using .get() with defaults
            p1_id = player1.get('user_id')
            p1_sid = player1.get('sid')
            p1_username = player1.get('username', 'Player 1')
            p1_elo = player1.get('elo', 1000)
            
            p2_id = player2.get('user_id')
            p2_sid = player2.get('sid')
            p2_username = player2.get('username', 'Player 2')
            p2_elo = player2.get('elo', 1000)

            # Ensure SIDs are valid before emitting
            if not p1_sid or not p2_sid:
                 print("ERROR: Missing SID for one or both players. Cannot emit match found.")
                 # Re-add players if SIDs are missing (maybe disconnected?)
                 matchmaking_queue.insert(0, player1)
                 matchmaking_queue.insert(0, player2)
                 return

            match_data_for_p1 = {
                'debate_id': db_debate.id,
                'topic': db_debate.topic,
                'opponent': {'id': p2_id, 'username': p2_username, 'elo': p2_elo}
            }
            match_data_for_p2 = {
                'debate_id': db_debate.id,
                'topic': db_debate.topic,
                'opponent': {'id': p1_id, 'username': p1_username, 'elo': p1_elo}
            }

            # Emit to both SIDs
            await sio.emit('match_found', match_data_for_p1, room=p1_sid)
            await sio.emit('match_found', match_data_for_p2, room=p2_sid)
            
            # Join both users into the debate room immediately
            await sio.enter_room(p1_sid, str(db_debate.id))
            await sio.enter_room(p2_sid, str(db_debate.id))
            
            print(f"Matchmaking Success: Match for Debate {db_debate.id} emitted.")
            
        except Exception as e:
            print(f"CRITICAL ERROR during match emit/room join: {e}")
            # Attempt to re-queue players if emit fails
            matchmaking_queue.insert(0, player1)
            matchmaking_queue.insert(0, player2)


@sio.event
async def cancel_matchmaking(sid, data):
    # ... (Your cancel_matchmaking logic) ...
    user_id = str(data.get('userId'))
    global matchmaking_queue
    matchmaking_queue = [q for q in matchmaking_queue if q['user_id'] != user_id]
    print(f"User {user_id} removed from queue. Size: {len(matchmaking_queue)}")
    
    
# NOTE: Other handlers like connect, user_online, user_offline, end_debate are omitted for brevity.
# Ensure they are present in your final file.