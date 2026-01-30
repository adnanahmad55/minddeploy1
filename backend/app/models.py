from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from datetime import datetime
import pytz
from app.database import Base

# --- IST Timezone Helper ---
def get_ist():
    """Returns the current time in India Standard Time (IST)"""
    return datetime.now(pytz.timezone('Asia/Kolkata'))

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    
    # IST Fix: Default set to get_ist helper
    created_at = Column(DateTime(timezone=True), default=get_ist)
    
    elo = Column(Integer, default=1000)
    mind_tokens = Column(Integer, default=0)

    # Relationships
    debates_as_player1 = relationship("Debate", foreign_keys="[Debate.player1_id]", back_populates="player1_obj")
    debates_as_player2 = relationship("Debate", foreign_keys="[Debate.player2_id]", back_populates="player2_obj")
    messages = relationship("Message", back_populates="sender_obj")

class Debate(Base):
    __tablename__ = "debates"

    id = Column(Integer, primary_key=True, index=True)
    player1_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    player2_id = Column(Integer, ForeignKey("users.id"), nullable=True) 
    topic = Column(String, nullable=False)
    winner = Column(String, nullable=True) 
    
    # IST Fix: Removed utcnow, added get_ist
    timestamp = Column(DateTime(timezone=True), default=get_ist)

    player1_obj = relationship("User", foreign_keys=[player1_id], back_populates="debates_as_player1")
    player2_obj = relationship("User", foreign_keys=[player2_id], back_populates="debates_as_player2")
    messages = relationship("Message", back_populates="debate")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    debate_id = Column(Integer, ForeignKey("debates.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(Text, nullable=False)
    
    # IST Fix: Added timezone-aware IST default
    timestamp = Column(DateTime(timezone=True), default=get_ist)
    sender_type = Column(String, default='user')

    debate = relationship("Debate", back_populates="messages")
    sender_obj = relationship("User", back_populates="messages")

class Badge(Base):
    __tablename__ = "badges"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)

class UserBadge(Base):
    __tablename__ = "user_badges"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False)

class Streak(Base):
    __tablename__ = "streaks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    current_streak = Column(Integer, default=0)
    max_streak = Column(Integer, default=0)

class Forum(Base):
    __tablename__ = "forums"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)

class Thread(Base):
    __tablename__ = "threads"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    forum_id = Column(Integer, ForeignKey("forums.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    thread_id = Column(Integer, ForeignKey("threads.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)