from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import database, models, schemas

router = APIRouter(
    prefix="/leaderboard",
    tags=["Leaderboard"]
)

@router.get("/", response_model=list[schemas.UserOut])
def get_leaderboard(db: Session = Depends(database.get_db)):
    return db.query(models.User).order_by(models.User.elo.desc()).limit(10).all()
