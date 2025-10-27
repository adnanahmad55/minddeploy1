# app/main.py

from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    auth_routes,
    leaderboard_routes,
    dashboard_routes,
    token_routes,
    gamification_routes,
    forum_routes,
    ai_debate_routes,
    analysis_routes
)
from app import debate, matchmaking
from app.socketio_instance import sio

import socketio
import traceback

# ✅ Allowed Origin List (Your Local + Frontend + Backend)
origins = [
    
    "https://striking-laughter-production-3040.up.railway.app",   # Frontend Deployed
               # Backend Deployed
]

# ✅ Create FastAPI App
fastapi_app = FastAPI()

# ✅ CORS Middleware (IMPORTANT)
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Request Logger (Optional but kept)
@fastapi_app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"\n--- REQUEST → {request.method} {request.url}")
    try:
        response = await call_next(request)
        print(f"--- RESPONSE ← {response.status_code}")
        return response
    except Exception as e:
        print("\n--- ERROR in request middleware ---")
        print(e)
        traceback.print_exc()
        return Response("Internal Server Error", status_code=500)

# ✅ WebSocket Manager (for group messaging)
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for conn in self.active_connections:
            await conn.send_text(message)

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

# ✅ Include Routers Properly
# Include routers
fastapi_app.include_router(auth_routes.router, tags=["Authentication"])
fastapi_app.include_router(debate.router, tags=["Debate"])  # Debate & Matchmaking logic internal
fastapi_app.include_router(leaderboard_routes.router, tags=["Leaderboard"])
fastapi_app.include_router(dashboard_routes.router, tags=["Dashboard"])
fastapi_app.include_router(token_routes.router, tags=["Token"])
fastapi_app.include_router(gamification_routes.router, tags=["Gamification"])
fastapi_app.include_router(forum_routes.router, tags=["Forum"])
fastapi_app.include_router(ai_debate_routes.router, tags=["AI Debate"])
fastapi_app.include_router(analysis_routes.router, tags=["Analysis"])

# ✅ Combine Socket.IO + FastAPI
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
