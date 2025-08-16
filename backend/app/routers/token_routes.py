from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import database, models, schemas, auth

router = APIRouter(
    prefix="/tokens",
    tags=["Tokens"]
)

@router.post("/redeem")
def redeem_tokens(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.mind_tokens < 10:
        raise HTTPException(status_code=400, detail="Not enough tokens.")

    current_user.mind_tokens -= 10
    db.commit()

    return {"message": "Tokens redeemed successfully."}
