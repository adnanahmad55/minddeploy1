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
    logger.debug(f"AI: Attempting to get response for prompt (first 80 chars): {prompt[:80]}")
    try:
        chat_completion = await client.chat.completions.create(
           model="llama-3.3-70b-versatile",   # ✅ fixed model name
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an AI debate assistant named ArguMind, trained to participate in structured intellectual debates on a wide range of academic, philosophical, technological, and socio-political topics. Your job is to present strong, well-reasoned arguments with clarity, precision, and confidence. Guidelines: Your answers must be concise (2 sentences max) but packed with logic, facts, or philosophical insight. Maintain a confident, objective, and assertive tone. Back claims with data, historical examples, or core reasoning. Challenge flawed assumptions and rebut opposing points effectively when asked. Avoid using filler phrases. Always define key terms when necessary, but briefly."
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