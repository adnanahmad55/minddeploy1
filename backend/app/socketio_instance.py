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
    # CRITICAL FIX: Pass the explicit list of origins here
    cors_allowed_origins=origins,
    # Optional: Allow all headers and methods for simplicity during debug
    cors_credentials=True, 
    # cors_allowed_methods=["*"], # Usually not needed unless specific methods used
    # cors_allowed_headers=["*"]  # Usually not needed unless specific headers used
)

# NOTE: Ensure this 'sio' instance is imported and used in matchmaking.py and main.py