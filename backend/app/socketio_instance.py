# app/socketio_instance.py - FINAL CORRECTED VERSION

import socketio

# Define the explicit list of allowed origins (MUST match main.py and your frontend URL)
origins = [
    "http://localhost:5173", # Local development
    "https://virtuous-harmony-production-273c.up.railway.app", # Your production frontend URL
    # Add any other origins if needed
]

sio = socketio.AsyncServer(
    async_mode="asgi",
    # 💥 FINAL TEST: Use Wildcard to rule out CORS 💥
    cors_allowed_origins="*", 
    cors_credentials=True, 
)
# NOTE: Ensure this 'sio' instance is imported and used in matchmaking.py and main.py