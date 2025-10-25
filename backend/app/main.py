# app/main.py

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Query 
from fastapi.middleware.cors import CORSMiddleware
# --- FIX 1: Import the matchmaking router from the routers directory ---
# Assuming your Matchmaking router is defined in 'app/routers/matchmaking_routes.py' 
# or is meant to be part of the main router imports.
from .routers import auth_routes, leaderboard_routes, dashboard_routes, token_routes, gamification_routes, forum_routes, ai_debate_routes, analysis_routes, matchmaking_routes # <--- FIX: Assumed router file
# --------------------------------------------------------------------------

# --- FIX 2: Removed unused and conflicting module import ---
# This was causing the AttributeError
from . import debate # <-- We keep 'debate' as it might be a required module
# from . import matchmaking <-- THIS IS NOW GONE (Causing the crash)
# --------------------------------------------------------------------------
from .socketio_instance import sio
import socketio
import traceback 


# Define the list of allowed origins explicitly
# NOTE: This list should contain your live Frontend URL (e.g., https://stellar-connection-production.up.railway.app)
origins = [
    "http://localhost:5173", # Local development
    "https://stellar-connection-production.up.railway.app" # Your live Frontend URL
]

# Create FastAPI instance
fastapi_app = FastAPI()

# Enable CORS - Using a fixed origins list is better in production, but we keep the wildcard 
# in the middleware header for maximum compatibility with the current logging setup.
fastapi_app.add_middleware(
    CORSMiddleware,
    # Using the defined origins list here:
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log incoming requests for debugging
@fastapi_app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"\n--- INCOMING HTTP REQUEST START ---")
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Headers: {request.headers}")
    print(f"--- REQUEST BODY (if any) ---")
    try:
        body = await request.body()
        print(f"Body: {body.decode('utf-8')}")
    except Exception as e:
        print(f"Could not read request body: {e}")
    print(f"--- END REQUEST BODY ---")

    response = Response("Internal Server Error", status_code=500)

    try:
        response = await call_next(request)
        print(f"--- OUTGOING HTTP RESPONSE START ---")
        print(f"Status: {response.status_code}")
        print(f"Headers: {response.headers}")
        # Ensure CORS header is added by middleware for broad compatibility
        response.headers["Access-Control-Allow-Origin"] = "*" 
        print(f"--- OUTGOING HTTP RESPONSE END ---")
        return response
    except Exception as e:
        print(f"\n--- CRITICAL EXCEPTION CAUGHT IN MIDDLEWARE ---")
        print(f"Error: {e}")
        traceback.print_exc()
        print(f"--- END CRITICAL EXCEPTION ---")
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
# Include routers
fastapi_app.include_router(auth_routes.router, tags=["Authentication"])
fastapi_app.include_router(debate.router, tags=["Debate"])
fastapi_app.include_router(leaderboard_routes.router, tags=["Leaderboard"])
fastapi_app.include_router(dashboard_routes.router, tags=["Dashboard"])

# --- FINAL FIX: Router को सही Import (matchmaking_routes) से शामिल किया गया ---
# अब यह 'matchmaking_routes' से router को लेगा और prefix '/matchmaking' देगा।
fastapi_app.include_router(matchmaking_routes.router, prefix="/matchmaking", tags=["Matchmaking"])
# --- END FINAL FIX ---

fastapi_app.include_router(token_routes.router, tags=["Token"])
fastapi_app.include_router(gamification_routes.router, tags=["Gamification"])
fastapi_app.include_router(forum_routes.router, tags=["Forum"])
fastapi_app.include_router(ai_debate_routes.router, tags=["AI Debate"])
fastapi_app.include_router(analysis_routes.router, tags=["Analysis"])

# Combine Socket.IO and FastAPI into a single ASGI app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)