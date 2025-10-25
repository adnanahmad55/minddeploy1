# app/main.py
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Query # Import Request, Response, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth_routes, leaderboard_routes, dashboard_routes, token_routes, gamification_routes, forum_routes, ai_debate_routes, analysis_routes
from . import debate, matchmaking
from .socketio_instance import sio
import socketio
import traceback # Import traceback for printing full error details

# Define the list of allowed origins explicitly
origins = [
    # "http://127.0.0.1:8080",
    # "http://localhost:5174",
    "http://localhost:5173",
    "https://stellar-connection-production.up.railway.app"

]

# Create FastAPI instance
fastapi_app = FastAPI()

# Enable CORS
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Still allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log incoming requests for debugging
@fastapi_app.middleware("http")
async def log_requests(request: Request, call_next): # Add type hints for clarity
    print(f"\n--- INCOMING HTTP REQUEST START ---")
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Headers: {request.headers}") # Log all headers for debugging CORS/Auth
    print(f"--- REQUEST BODY (if any) ---")
    # Attempt to read body. Note: Body can only be read once.
    # If the handler needs to read it later, this might cause issues.
    # For debugging, it's often useful.
    try:
        body = await request.body()
        print(f"Body: {body.decode('utf-8')}")
    except Exception as e:
        print(f"Could not read request body: {e}")
    print(f"--- END REQUEST BODY ---")

    response = Response("Internal Server Error", status_code=500) # Initialize a generic response

    try:
        response = await call_next(request)
        print(f"--- OUTGOING HTTP RESPONSE START ---")
        print(f"Status: {response.status_code}")
        print(f"Headers: {response.headers}") # Log response headers too
        response.headers["Access-Control-Allow-Origin"] = "*" # Ensure this is always added
        print(f"--- OUTGOING HTTP RESPONSE END ---")
        return response
    except Exception as e:
        print(f"\n--- CRITICAL EXCEPTION CAUGHT IN MIDDLEWARE ---")
        print(f"Error: {e}")
        traceback.print_exc() # Print the full traceback
        print(f"--- END CRITICAL EXCEPTION ---")
        # Ensure a 500 is returned even if middleware catches it
        return Response("Internal Server Error: See server logs for details", status_code=500, media_type="text/plain")

# Define a simple connection manager for WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@fastapi_app.websocket("/ws/{group_name}")
async def websocket_endpoint(websocket: WebSocket, group_name: str, username: str = Query(...)):
    await manager.connect(websocket, username)
    await manager.broadcast(f"📢 {username} joined {group_name}")
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"{username}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"❌ {username} left {group_name}")

# Include routers
fastapi_app.include_router(auth_routes.router)
fastapi_app.include_router(debate.router)
fastapi_app.include_router(leaderboard_routes.router)
fastapi_app.include_router(dashboard_routes.router)
# --- REMOVED: No router from matchmaking.py anymore ---
# fastapi_app.include_router(matchmaking.router)
# --- END REMOVED ---
fastapi_app.include_router(token_routes.router)
fastapi_app.include_router(gamification_routes.router)
fastapi_app.include_router(forum_routes.router)
fastapi_app.include_router(ai_debate_routes.router)
fastapi_app.include_router(analysis_routes.router)

# Combine Socket.IO and FastAPI into a single ASGI app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)