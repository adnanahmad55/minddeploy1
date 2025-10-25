from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
# FIX: Changed relative imports to Gunicorn-safe absolute imports
from app import database, models, schemas, auth 
from app.ai import get_ai_response # Assuming app.ai is the module path

router = APIRouter(
    prefix="/analysis",
    tags=["Analysis"]
)

@router.get("/{debate_id}", response_model=schemas.Analysis)
async def get_analysis(
    debate_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    print(f"Analysis requested for debate {debate_id} by user {current_user.username} (ID: {current_user.id})")

    debate_obj = db.query(models.Debate).filter(
        models.Debate.id == debate_id
    ).first()

    if not debate_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debate not found.")

    if current_user.id != debate_obj.player1_id and current_user.id != debate_obj.player2_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this debate's analysis."
        )

    messages = db.query(models.Message).options(joinedload(models.Message.sender_obj)).filter(
        models.Message.debate_id == debate_id
    ).order_by(models.Message.timestamp).all()

    if not messages:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No messages found for this debate to analyze.")

    debate_transcript_lines = []
    for message in messages:
        sender_display_name = "AI"
        if message.sender_type == 'user' and message.sender_obj:
            sender_display_name = message.sender_obj.username
        
        debate_transcript_lines.append(f"{sender_display_name}: {message.content}")

    # --- Updated Prompt for Formatted Analysis ---
    prompt = (
        "You are a professional debate judge. Analyze the following debate transcript. "
        "Provide a concise, insightful, and well-structured analysis. "
        "Use markdown formatting to make the output easy to read, with clear sections for 'Strengths', 'Weaknesses', and 'Overall Assessment'. "
        "Do not write a long, flowing paragraph. Use bullet points and line breaks. "
        "Identify key points, logical strengths/fallacies, and rhetorical effectiveness. "
        "Conclude with a final assessment of who had the stronger case.\n\n"
        f"Transcript:\n"
        + "\n".join(debate_transcript_lines)
    )
    # --- End Updated Prompt ---

    analysis_content = await get_ai_response(prompt)

    # NOTE: Schemas.Analysis assumes the return structure is {'analysis': string}
    return schemas.Analysis(analysis=analysis_content)