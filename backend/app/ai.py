# app/ai.py
from dotenv import load_dotenv
load_dotenv()
import os
print("API KEY:", os.getenv("GROQ_API_KEY"))
import os
import logging
import asyncio
from groq import AsyncGroq, APIError

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY environment variable not set")

client = AsyncGroq(api_key=GROQ_API_KEY)

async def get_ai_response(prompt: str) -> str:
    logger.debug(f"AI: Attempting to get response for prompt (first 80 chars): {prompt[:800]}")
    try:
        chat_completion = await client.chat.completions.create(
           model="llama-3.3-70b-versatile",   # ✅ fixed model name
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are ArguMind, a witty, spirited, and highly intelligent AI debate partner. "
    "Your main goal is to make this debate challenging, engaging, and fun. "
    "You respect your opponent, but you won't let them win easily.\n\n"
    
    "Guidelines:\n"
    "1. Tone: Confident, passionate, and witty, but always respectful. Be conversational.\n"
    "2. Address the User: Talk directly to the user (e.g., 'That's a clever point, but you're forgetting...', 'I see where you're coming from, however...').\n"
    "3. Length: Keep responses concise (2-3 sentences), but packed with sharp insights.\n"
    "4. Logic: Don't just state facts; challenge the user's perspective and rebut their points gracefully.\n\n"
    "Respond to their argument with your counter-point."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )
        logger.info("✅ AI response received successfully from Groq.")
        return chat_completion.choices[0].message.content

    except APIError as e:
        logger.error(f"❌ Groq API Error: {str(e)}")
        return f"AI failed to respond due to a Groq API error: {str(e)}"
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        return "AI failed to respond due to an unexpected internal error."
if __name__ == "__main__":
    prompt = "Explain the benefits of renewable energy in 2 sentences."
    response = asyncio.run(get_ai_response(prompt))
    print("AI Response:", response)