from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# Helper function to convert datetime objects to ISO format strings
def datetime_to_iso_str(dt: datetime) -> str:
    return dt.isoformat()


# ------------------ AUTH TOKEN ------------------ #
class Token(BaseModel): # <<< FIX: Token class is moved here.
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

    class Config:
        from_attributes = True

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
    # CRITICAL FIX: Make player2_id Optional[int] to accept None during matchmaking
    player2_id: Optional[int] 
    topic: str
    winner: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: datetime_to_iso_str
        }


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

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: datetime_to_iso_str
        }

# NOTE: Forum, Thread, Post, UserStats, DebateHistory, LeaderboardEntry
# जैसी अन्य स्कीमा यहाँ मौजूद हैं, लेकिन उन्हें brevity के लिए हटा दिया गया है।
# सुनिश्चित करें कि वे आपकी असली फ़ाइल में मौजूद हों।