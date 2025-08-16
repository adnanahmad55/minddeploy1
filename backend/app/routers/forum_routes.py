from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import database, models, schemas, auth

router = APIRouter(
    prefix="/forums",
    tags=["Forums"]
)

@router.get("/", response_model=list[schemas.Forum])
def get_forums(db: Session = Depends(database.get_db)):
    return db.query(models.Forum).all()

@router.get("/{forum_id}/threads", response_model=list[schemas.Thread])
def get_threads(forum_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.Thread).filter(models.Thread.forum_id == forum_id).all()

@router.get("/threads/{thread_id}/posts", response_model=list[schemas.Post])
def get_posts(thread_id: int, db: Session = Depends(database.get_db)):
    return db.query(models.Post).filter(models.Post.thread_id == thread_id).all()

@router.post("/threads", response_model=schemas.Thread)
def create_thread(thread: schemas.ThreadCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_thread = models.Thread(**thread.dict(), user_id=current_user.id)
    db.add(db_thread)
    db.commit()
    db.refresh(db_thread)
    return db_thread

@router.post("/posts", response_model=schemas.Post)
def create_post(post: schemas.PostCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_post = models.Post(**post.dict(), user_id=current_user.id)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post
