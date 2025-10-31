# app/main.py - FINAL WORKING CODE (CORS CHECK)

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Query 
from fastapi.middleware.cors import CORSMiddleware
# Gunicorn Import Fix: app.routers का उपयोग करें
from app.routers import auth_routes, leaderboard_routes, dashboard_routes, token_routes, gamification_routes, forum_routes, ai_debate_routes, analysis_routes
from app import debate, matchmaking
from app.socketio_instance import sio 
import socketio
import traceback 

# Define the list of allowed origins explicitly - CRITICAL
origins = [
    "https://minddeploy1-production.up.railway.app/",
    "https://striking-laughter-production-3040.up.railway.app",  # Frontend
    # Backend own URL
]
# Create FastAPI instance
fastapi_app = FastAPI()

# Enable CORS - THIS MUST BE THE FIRST MIDDLEWARE
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Log incoming requests for debugging (Keeping original logging middleware)
@fastapi_app.middleware("http")
async def log_requests(request: Request, call_next):
    # ... (Your logging logic remains unchanged, but placed AFTER CORS) ...
    print(f"\n--- INCOMING HTTP REQUEST START ---")
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    print(f"Headers: {request.headers}")
    print(f"--- REQUEST BODY (if any) ---")
    try:
        # NOTE: Cannot await request.body() before call_next if not reading it fully
        pass # Skipping heavy body logging for simplicity
    except Exception as e:
        pass 
    print(f"--- END REQUEST BODY ---")

    response = Response("Internal Server Error", status_code=500)

    try:
        response = await call_next(request)
        print(f"--- OUTGOING HTTP RESPONSE START ---")
        print(f"Status: {response.status_code}")
        print(f"Headers: {response.headers}")
        # The CORS middleware should handle the header, but keeping this for safety:
        # response.headers["Access-Control-Allow-Origin"] = request.headers.get('origin', '*') 
        print(f"--- OUTGOING HTTP RESPONSE END ---")
        return response
    except Exception as e:
        print(f"\n--- CRITICAL EXCEPTION CAUGHT IN MIDDLEWARE ---")
        print(f"Error: {e}")
        traceback.print_exc()
        print(f"--- END CRITICAL EXCEPTION ---")
        return Response("Internal Server Error: See server logs for details", status_code=500, media_type="text/plain")

# Define a simple connection manager for WebSocket connections (Kept but unused)
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
    # ... (ConnectionManager methods) ...

manager = ConnectionManager()

@fastapi_app.websocket("/ws/{group_name}")
async def websocket_endpoint(websocket: WebSocket, group_name: str, username: str = Query(...)):
    # ... (Your WebSocket logic remains unchanged) ...
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
fastapi_app.include_router(auth_routes.router, tags=["Authentication"])

# FIX: Debate router now correctly included
fastapi_app.include_router(debate.router, tags=["Debate"])
fastapi_app.include_router(debate.router, prefix="/matchmaking", tags=["Matchmaking"])
# --- END FIX ---

fastapi_app.include_router(leaderboard_routes.router, tags=["Leaderboard"])
fastapi_app.include_router(dashboard_routes.router, tags=["Dashboard"])
fastapi_app.include_router(token_routes.router, tags=["Token"])
fastapi_app.include_router(gamification_routes.router, tags=["Gamification"])
fastapi_app.include_router(forum_routes.router, tags=["Forum"])
fastapi_app.include_router(ai_debate_routes.router, tags=["AI Debate"])
fastapi_app.include_router(analysis_routes.router, tags=["Analysis"])

# Combine Socket.IO and FastAPI into a single ASGI app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)