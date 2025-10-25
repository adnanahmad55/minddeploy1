from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app import models, schemas, database, auth # Gunicorn-safe absolute imports

# Set up the router
router = APIRouter(
    tags=["Authentication"]
)

# ------------------ TOKEN (LOGIN) ------------------
@router.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db)
):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Token expiration is handled in auth.py (currently set to 24 hours)
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# ------------------ REGISTER USER ------------------
@router.post("/register", response_model=schemas.UserOut)
def register_new_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    # Check if user already exists
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password and create user
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        elo=1000, # Default ELO
        mind_tokens=0 # Default tokens
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# ------------------ GET CURRENT USER DETAILS ------------------
@router.get("/users/me/", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """
    Returns the details of the currently authenticated user.
    This fixes the /users/me failed error (if the token is valid).
    """
    return current_user
