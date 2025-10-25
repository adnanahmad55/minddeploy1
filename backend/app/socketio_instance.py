import socketio

# Define the explicit list of allowed origins (Matches main.py)
origins = [
    "http://localhost:5173",
    "https://stellar-connection-production.up.railway.app" 
]

sio = socketio.AsyncServer(
    async_mode="asgi",
    # Pass the explicit list of origins
    cors_allowed_origins=origins 
)