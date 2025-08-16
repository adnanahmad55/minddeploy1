# app/ai.py
import os
import logging
from groq import Groq, APIError, AsyncGroq
import asyncio

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

async def get_ai_response(prompt: str) -> str:
    logger.debug(f"AI: Attempting to get response for prompt (first 80 chars): {prompt[:80]}")
    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY environment variable not set.")
        return "AI response failed: API key is missing."

    try:
        client = AsyncGroq(api_key=GROQ_API_KEY)

        chat_completion = await client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an AI debate assistant named ArguMind, trained to participate in structured intellectual debates on a wide range of academic, philosophical, technological, and socio-political topics. Your job is to present strong, well-reasoned arguments with clarity, precision, and confidence. Guidelines: Your answers must be concise (2 sentences max) but packed with logic, facts, or philosophical insight. Maintain a confident, objective, and assertive tone. Back claims with data, historical examples, or core reasoning. Challenge flawed assumptions and rebut opposing points effectively when asked. Avoid using filler phrases. Always define key terms when necessary, but briefly."
                },
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama3-70b-8192",
            temperature=0.0
        )
        logger.info("AI response received successfully from Groq.")
        return chat_completion.choices[0].message.content
    except APIError as e:
        logger.exception(f"Groq API Error: {e.response.status_code} - {e.response.text}")
        return "AI failed to respond due to a Groq API error."
    except Exception as e:
        logger.exception(f"Unexpected error in get_ai_response: {e}")
        return "AI failed to respond due to an unexpected internal error."