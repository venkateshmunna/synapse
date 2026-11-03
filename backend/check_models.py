import os
from dotenv import load_dotenv
from groq import Groq

# Load .env file
load_dotenv(".env")
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    print("GROQ_API_KEY not found in .env! Check your backend/.env file.")
else:
    try:
        client = Groq(api_key=api_key)
        models = [m.id for m in client.models.list().data]
        print("\n--- Available Groq Models on your account ---")
        for model in sorted(models):
            print(f"• {model}")
        print("---------------------------------------------\n")
    except Exception as e:
        print(f"Groq connection error: {e}")