from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import datetime

# Helper function to convert datetime objects to ISO format strings
# Ab models se IST aayega, toh ye +05:30 offset ke saath string banayega
def datetime_to_iso_str(dt: datetime) -> str:
    return dt.isoformat()


# ------------------ AUTH TOKEN ------------------ #
class Token(BaseModel): 
    access_token: str
    token_type: str

# ------------------ USER SCHEMAS ------------------ #
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    elo: Optional[int] = 0
    mind_tokens: Optional[int] = 0
    # Agar created_at dikhana chahte ho toh:
    # created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# --- STATS & GAMIFICATION SCHEMAS ---
class UserStats(BaseModel):
    debates_won: int
    debates_lost: int
    debates_competed: int

    model_config = ConfigDict(from_attributes=True)
        
class DebateHistory(BaseModel):
    id: int
    topic: str
    opponent_username: str
    winner: Optional[str] 
    date: str

    model_config = ConfigDict(from_attributes=True)
        
class Badge(BaseModel):
    id: int
    name: str
    description: str

    model_config = ConfigDict(from_attributes=True)

class Streak(BaseModel):
    id: int
    user_id: int
    current_streak: int
    max_streak: int

    model_config = ConfigDict(from_attributes=True)

class Forum(BaseModel):
    id: int
    name: str
    description: str

    model_config = ConfigDict(from_attributes=True)

class Thread(BaseModel):
    id: int
    title: str
    forum_id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)

class ThreadCreate(BaseModel):
    title: str
    forum_id: int

class Post(BaseModel):
    id: int
    content: str
    thread_id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)

class PostCreate(BaseModel):
    content: str
    thread_id: int

class Analysis(BaseModel):
    analysis: str

# ------------------ DEBATE SCHEMAS ------------------ #
class TopicSchema(BaseModel):
    topic: str

class DebateCreate(BaseModel):
    player1_id: int
    player2_id: int
    topic: str


class DebateOut(BaseModel):
    id: int
    player1_id: int
    player2_id: Optional[int] 
    topic: str
    winner: Optional[str] = None
    timestamp: datetime

    # Pydantic V2 uses model_config instead of class Config
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={datetime: datetime_to_iso_str}
    )


# ------------------ MESSAGE SCHEMAS ------------------ #
class MessageCreate(BaseModel):
    sender_id: Optional[int] = None
    content: str
    sender_type: str = 'user'


class MessageOut(BaseModel):
    id: int
    content: str
    sender_id: Optional[int] = None
    debate_id: int
    timestamp: datetime 
    sender_type: str

    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={datetime: datetime_to_iso_str}
    )

# ------------------ LEADERBOARD SCHEMAS ------------------ #
class LeaderboardEntry(BaseModel):
    username: str
    elo: int
    mind_tokens: int

    model_config = ConfigDict(from_attributes=True)