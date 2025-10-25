import socketio

# Ensure this list is absolutely correct and covers all client URLs
origins = [
    "http://localhost:5173", # Local development
    "https://stellar-connection-production.up.railway.app", # Your production frontend URL
    # Add any other origins your app might connect from, e.g., staging or custom domains
]

sio = socketio.AsyncServer(
    async_mode="asgi",
    # Pass the explicit list of origins to fix the 403 error
    cors_allowed_origins=origins 
)