from dotenv import load_dotenv
load_dotenv()
print("API KEY:", os.getenv("GROQ_API_KEY"))

from groq import Groq
import os

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
models = client.models.list()

for m in models.data:
    print(m.id)
