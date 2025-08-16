# app/routers/dashboard_routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_ # Import the `or_` function for logical OR operations
from .. import database, models, schemas, auth

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)

# ----------------- GET USER STATS -----------------
@router.get("/stats", response_model=schemas.UserStats)
def get_user_stats(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Corrected query to count debates where the user was either player1 or player2
    debates_competed = db.query(models.Debate).filter(
        or_(models.Debate.player1_id == current_user.id, models.Debate.player2_id == current_user.id)
    ).count()

    # Query to count debates won by the current user
    debates_won = db.query(models.Debate).filter(
        or_(
            models.Debate.player1_id == current_user.id, 
            models.Debate.player2_id == current_user.id
        ),
        models.Debate.winner == current_user.username
    ).count()

    # Query to count debates that were a draw
    debates_drawn = db.query(models.Debate).filter(
        or_(
            models.Debate.player1_id == current_user.id, 
            models.Debate.player2_id == current_user.id
        ),
        models.Debate.winner == "Draw"
    ).count()

    # Debates lost is total minus won and drawn
    debates_lost = debates_competed - debates_won - debates_drawn

    return {
        "debates_won": debates_won,
        "debates_lost": debates_lost,
        "debates_competed": debates_competed
    }

# ----------------- GET USER HISTORY -----------------
# This will return a list of dictionaries with opponent username included
@router.get("/history", response_model=list[schemas.DebateHistory])
def get_user_history(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Corrected query to fetch debates the user participated in
    debates_history = (
        db.query(models.Debate)
        .filter(or_(models.Debate.player1_id == current_user.id, models.Debate.player2_id == current_user.id))
        .order_by(models.Debate.timestamp.desc())
        .limit(10)
        .all()
    )

    history_list = []
    for debate in debates_history:
        # Determine the opponent's ID
        opponent_id = debate.player1_id if debate.player2_id == current_user.id else debate.player2_id

        # Fetch opponent's username, defaulting to "AI Bot" if needed
        opponent_username = "AI Bot"
        if opponent_id != 0: # Assuming AI has ID 0
            opponent = db.query(models.User).filter(models.User.id == opponent_id).first()
            if opponent:
                opponent_username = opponent.username
        
        history_list.append({
            "id": debate.id,
            "topic": debate.topic,
            "opponent_username": opponent_username,
            "winner": debate.winner,
            "date": debate.timestamp.isoformat(), # Return as ISO format string
        })

    return history_list