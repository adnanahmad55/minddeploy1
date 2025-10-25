from app.socketio_instance import sio 
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app import database, models, schemas
from typing import Dict, Any, Optional, List
from datetime import datetime
from jose import JWTError, jwt 
import os

# NOTE: Since Gunicorn -w 1 is set, these are safe Global lists
online_users: Dict[str, Any] = {}
matchmaking_queue: List[Dict[str, Any]] = []

# ... (connect, user_online, user_offline handlers are assumed to be correct) ...

@sio.event
async def join_matchmaking_queue(sid, data):
    user_id = str(data.get('userId'))
    debate_id = data.get('debateId') # <--- Getting debate ID from the client data

    if not user_id or not debate_id:
        await sio.emit('error', {'detail': 'Missing user or debate ID for queue.'}, room=sid)
        return

    # 1. Check if user is already in queue (or if their SID is still valid)
    user_data = next((user for user in matchmaking_queue if user['user_id'] == user_id), None)
    
    if not user_data:
        # Get authenticated user info
        online_user_data = online_users.get(user_id)
        if not online_user_data:
             await sio.emit('toast', {'title': 'Error', 'description': 'Not registered as online.'}, room=sid)
             return
             
        # Create user data structure
        user_data = {
            'user_id': user_id,
            'elo': online_user_data.get('elo', 1000), 
            'sid': sid,
            'debate_id': debate_id, # Storing the newly created debate ID
            'username': online_user_data['username']
        }
        matchmaking_queue.append(user_data)
        print(f"User {user_data['username']} added to queue. Size: {len(matchmaking_queue)}")
    
    # 2. Check for an immediate match
    if len(matchmaking_queue) >= 2:
        
        # Simple FIFO matching (first in, first out)
        player1 = matchmaking_queue.pop(0) # The first user waiting (debate creator)
        player2 = matchmaking_queue.pop(0) # The second user waiting
        
        print(f"Match Found: {player1['username']} vs {player2['username']}")

        # 3. Update the debate in the database (set player2_id)
        try:
            with database.SessionLocal() as db:
                db_debate = db.query(models.Debate).filter(models.Debate.id == player1['debate_id']).first()

                if db_debate:
                    # Update player 2's ID and commit
                    db_debate.player2_id = int(player2['user_id']) 
                    db.commit()
                else:
                    print(f"WARNING: Debate {player1['debate_id']} not found for matchmaking update.")
                    return 
                    
        except Exception as e:
            print(f"CRITICAL DB ERROR during matchmaking update: {e}")
            return

        # 4. Notify both users about the match
        
        # NOTE: Front-end is waiting for 'match_found' event
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

# ... (Your other handlers like cancel_matchmaking, challenge_user, etc. remain below) ...