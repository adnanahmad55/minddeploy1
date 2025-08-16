# app/evaluation.py
import json
import asyncio
from typing import Dict, Any, List

from . import models
from .ai import get_ai_response

async def evaluate_debate(messages: List[models.Message]) -> Dict[str, Any]:
    """
    Evaluates a debate transcript using the Groq AI model.
    The function returns a structured dictionary containing the analysis.
    """
    if not messages:
        return {
            'winner_id': None,
            'result': 'draw',
            'elo_change': 0,
            'score': 50,
            'feedback': {
                'logic': 50,
                'persuasion': 50,
                'evidence': 50,
                'style': 50,
                'overall': "The debate could not be evaluated as no messages were sent."
            }
        }

    debate_transcript_lines = []
    for message in messages:
        sender_display_name = "AI"
        if message.sender_type == 'user' and message.sender_id is not None:
            # Note: For this to work, you would need to load the user's username.
            # A more robust version would pass usernames from the start.
            # For now, let's just use 'User' or 'AI'.
            sender_display_name = "User" if message.sender_type == 'user' else "AI"
        
        debate_transcript_lines.append(f"{sender_display_name}: {message.content}")
        
    transcript = "\n".join(debate_transcript_lines)

    # --- Updated Prompt for Structured JSON Output ---
    prompt = (
        "You are an expert debate judge with a deep understanding of logical fallacies, rhetorical techniques, and evidence-based reasoning. "
        "Your task is to analyze the following debate transcript and provide a structured JSON response. "
        "The participants are 'User' and 'AI'. Please evaluate their performance on a scale of 1-100 for each category. "
        "The JSON response should have the following structure and data types. Do not include any other text in your response.\n\n"
        "{\n"
        "  \"winner\": \"string\",\n"
        "  \"score\": \"number\",\n"
        "  \"elo_change\": \"number\",\n"
        "  \"feedback\": {\n"
        "    \"logic\": \"number\",\n"
        "    \"persuasion\": \"number\",\n"
        "    \"evidence\": \"number\",\n"
        "    \"style\": \"number\",\n"
        "    \"overall\": \"string\"\n"
        "  }\n"
        "}\n\n"
        "Here is the debate transcript to analyze:\n\n"
        f"{transcript}\n\n"
        "Based on this transcript, provide the structured JSON response as a single, complete object. Do not include any other text in your response. Ensure the 'winner' is either 'User', 'AI', or 'Draw'."
    )
    # --- End Updated Prompt ---

    try:
        analysis_content = await get_ai_response(prompt)
        
        parsed_analysis = json.loads(analysis_content)
        
        winner_id = None
        if parsed_analysis.get('winner') == 'User' and messages:
            first_user_message = next((m for m in messages if m.sender_type == 'user'), None)
            if first_user_message:
                winner_id = first_user_message.sender_id
        elif parsed_analysis.get('winner') == 'AI':
            winner_id = 0
            
        return {
            'winner_id': winner_id,
            'result': parsed_analysis.get('winner'),
            'elo_change': parsed_analysis.get('elo_change'),
            'score': parsed_analysis.get('score'),
            'feedback': parsed_analysis.get('feedback'),
        }

    except json.JSONDecodeError as e:
        print(f"Error decoding AI response JSON: {e}")
        return {
            'winner_id': None,
            'result': 'undetermined',
            'elo_change': 0,
            'score': 50,
            'feedback': {
                'logic': 50, 'persuasion': 50, 'evidence': 50, 'style': 50,
                'overall': f"AI analysis failed to return a valid JSON response. Raw output was: {analysis_content}"
            }
        }
    except Exception as e:
        print(f"An unexpected error occurred during AI evaluation: {e}")
        return {
            'winner_id': None,
            'result': 'undetermined',
            'elo_change': 0,
            'score': 50,
            'feedback': {'logic': 50, 'persuasion': 50, 'evidence': 50, 'style': 50, 'overall': "An unexpected server error occurred during AI evaluation."}
        }