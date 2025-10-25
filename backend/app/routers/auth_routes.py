from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app import models, schemas, database, auth # Gunicorn-safe absolute imports
from app.socketio_instance import sio # Gunicorn-safe absolute import

router = APIRouter(
    tags=["Authentication"]
)

# ----------------- LOGIN (New POST /token endpoint) -----------------
# Frontend must call this endpoint using URL /token, NOT /login
@router.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(database.get_db)
):
    """
    Authenticates user credentials and returns a JWT access token.
    Frontend must send username and password as form data.
    """
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create token that expires in 1440 minutes (24 hours)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=None
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ----------------- USER REGISTRATION (POST /register) -----------------
@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    """
    Registers a new user and hashes the password.
    """
    # Check if user already exists (by email)
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email already registered"
        )
    
    # Hash password
    hashed_password = auth.get_password_hash(user.password)
    
    # Create user in database
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        elo=1000, # Initial ELO
        mind_tokens=0 # Initial tokens
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user

# ----------------- GET CURRENT USER DETAILS (GET /users/me) -----------------
@router.get("/users/me", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """
    Returns the details of the currently authenticated user (used for token validation).
    """
    return current_user

# ----------------- TOKEN VALIDATION (Debugging/Utility) -----------------
@router.get("/token/status")
def get_token_status(current_user: models.User = Depends(auth.get_current_user)):
    """
    Utility endpoint to quickly check if the JWT token is valid.
    """
    return {"status": "ok", "user_id": current_user.id}
