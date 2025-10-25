import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
    Send,
    LogOut,
    MessageCircle,
    Users,
    Clock,
    Brain,
    ArrowLeft,
} from "lucide-react";
import io, { Socket } from "socket.io-client";

// ----------------------------------------------------
// *** FIX: Define API_BASE using Environment Variable ***
// ----------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Message {
    id: string;
    content: string;
    sender_id: number | null;
    sender_type: "user" | "ai";
    debate_id: number;
    timestamp: Date;
}

interface Opponent {
    id: string;
    username: string;
    elo: number;
    is_ai: boolean;
}

interface DebateDetails {
    id: number;
    topic: string;
    player1_id: number;
    player2_id: number;
    player1_username: string;
    player2_username: string;
}

const ChatRoom = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [isDebateActive, setIsDebateActive] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const messagesRef = useRef(messages);
    const userRef = useRef(user);

    const debateId = location.state?.debateId;
    const opponent = location.state?.opponent;
    const topic = location.state?.topic;

    const [debateDetails, setDebateDetails] = useState<DebateDetails | null>(
        null
    );
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        messagesRef.current = messages;
        const interval = setInterval(() => {
            connectAndFetchData();
        }, 50); // Retry interval reduced for faster testing
        return () => clearInterval(interval);
    }, [messages]);
    
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const socketRef = useRef<Socket | null>(null);

    const connectAndFetchData = async () => {
        // Ensure user and opponent data is available before proceeding
        if (!user || !opponent || !debateId) return;

        const userId = parseInt(user.id, 10);
        // const opponentUserId = parseInt(opponent.id, 10); // Not directly used in fetches

        try {
            // 1. API Fetch Fix: Fetch Debate Details
            const debateRes = await fetch(`${API_BASE}/debate/${debateId}`);
            if (!debateRes.ok) {
                throw new Error(`Failed to fetch debate details: ${debateRes.status}`);
            }
            const debateData = await debateRes.json();

            if (
                debateData.player1_id !== userId &&
                debateData.player2_id !== userId
            ) {
                throw new Error("You are not a participant in this debate.");
            }

            // 2. API Fetch Fix: Fetch User Data (player1)
            const player1Data =
                debateData.player1_id === userId
                    ? userRef.current
                    : await (
                        await fetch(
                            `${API_BASE}/users/${debateData.player1_id}`
                        )
                    ).json();
                    
            // 3. API Fetch Fix: Fetch User Data (player2)
            const player2Data =
                debateData.player2_id === userId
                    ? userRef.current
                    : await (
                        await fetch(
                            `${API_BASE}/users/${debateData.player2_id}`
                        )
                    ).json();

            setDebateDetails({
                ...debateData,
                player1_username: player1Data.username,
                player2_username: player2Data.username,
            });

            setIsDebateActive(true);

            // 4. Socket.IO Fix: Initialize Socket with API_BASE
            if (!socketRef.current) {
                console.log("Initializing new socket instance for ChatRoom.");
                socketRef.current = io(API_BASE, { // <-- CRITICAL FIX: Changed from "http://127.0.0.1:8000" to API_BASE
                    query: { debateId: debateId, userId: userId },
                    // Added transport fix as well
                    transports: ['websocket', 'polling']
                });
                console.log("DEBUG: Socket initialized:", socketRef.current);

                // --- ADDED: Enhanced debugging logs for connect lifecycle ---
                socketRef.current.on("connect", () => {
                    console.log(
                        "DEBUG: Socket Connected to server. Emitting join_debate_room."
                    );
                    socketRef.current?.emit("join_debate_room", {
                        debateId: debateId,
                        userId: userId,
                    });
                });

                socketRef.current.on("disconnect", (reason) => {
                    console.log(`DEBUG: Socket Disconnected. Reason: ${reason}`);
                });

                socketRef.current.on("connect_error", (error) => {
                    console.error("ERROR: Socket connection error:", error);
                    toast({
                        title: "Connection Error",
                        description: "Failed to connect to the server.",
                        variant: "destructive",
                    });
                });
                // --- END ADDED ---

                socketRef.current.on("new_message", (message: any) => {
                    console.log("DEBUG: Received new message event:", message);
                    setMessages((prev) => [
                        ...prev,
                        {
                            ...message,
                            id: String(message.id),
                            sender_id:
                                message.sender_id !== null ? Number(message.sender_id) : null,
                            timestamp: new Date(message.timestamp),
                        },
                    ]);
                });

                socketRef.current.on("debate_ended", (data) => {
                    console.log(
                        "DEBUG: Debate ended event received, navigating to results."
                    );
                    navigate("/result", {
                        state: {
                            opponent:
                                userRef.current?.id === String(debateData.player1_id)
                                    ? {
                                        id: String(debateData.player2_id),
                                        username: debateData.player2_username,
                                        elo: 0,
                                        is_ai: false,
                                    }
                                    : {
                                        id: String(debateData.player1_id),
                                        username: debateData.player1_username,
                                        elo: 0,
                                        is_ai: false,
                                    },
                            topic: debateData.topic,
                            messages: messagesRef.current,
                            duration: 0,
                            winner: data.winner,
                            debateId: debateId,
                        },
                    });
                });
            }

            // 5. API Fetch Fix: Initial Messages
            const initialMessagesRes = await fetch(
                `${API_BASE}/debate/${debateId}/messages`
            );
            if (!initialMessagesRes.ok)
                throw new Error("Failed to fetch initial messages.");
            const initialMessagesData = await initialMessagesRes.json();
            setMessages(
                initialMessagesData.map((m: any) => ({
                    ...m,
                    id: String(m.id),
                    sender_id: m.sender_id !== null ? Number(m.sender_id) : null,
                    timestamp: new Date(m.timestamp),
                }))
            );
        } catch (error) {
            console.error("Failed to connect or fetch debate data:", error);
            toast({
                title: "Connection Error",
                description: `Could not join debate: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
                variant: "destructive",
            });
            setDebateDetails(null);
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setIsDebateActive(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!debateId || !user) {
            toast({
                title: "No Debate Found",
                description: "You must start a debate from matchmaking.",
            });
            setIsLoading(false);
            navigate("/matchmaking");
            return;
        }
    }, [debateId, user, navigate, opponent, topic]); // Removed interval dependency for simplicity

    useEffect(() => {
        // Run connectAndFetchData only if user is defined
        if (user && debateId) {
            connectAndFetchData();
        }
        
        // Cleanup function
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user, debateId]); 

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = async () => {
        if (
            !messageInput.trim() ||
            !socketRef.current ||
            !isDebateActive ||
            !debateDetails
        ) {
            toast({
                title: "Not Connected",
                description: "Please join a debate first.",
                variant: "destructive",
            });
            return;
        }

        const senderId = parseInt(String(user?.id), 10);
        const debateId = debateDetails.id;

        const messageData = {
            content: messageInput,
            sender_type: "user",
            sender_id: senderId,
        };

        const newMessage: Message = {
            id: Date.now().toString(),
            content: messageInput,
            sender_type: "user",
            sender_id: senderId,
            debate_id: debateId,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, newMessage]);
        setMessageInput("");

        console.log("Sending message to human opponent via socket...");
        socketRef.current?.emit("send_message_to_human", {
            debateId: debateId,
            senderId: senderId,
            content: newMessage.content,
            senderType: "user",
        });
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const endDebate = () => {
        if (!socketRef.current || !debateDetails || !isDebateActive) {
            toast({
                title: "Debate Not Active",
                description: "No active debate to end.",
                variant: "destructive",
            });
            return;
        }
        setIsDebateActive(false);
        toast({
            title: "Debate finished!",
            description: "Time's up! Calculating results...",
        });
        socketRef.current.emit("end_debate", {
            debate_id: debateDetails.id,
            current_messages: messagesRef.current,
        });

        // --- CONCRETE FIX: Immediate navigation to results page ---
        navigate("/result", {
            state: {
                opponent:
                    user?.id === String(debateDetails?.player1_id)
                        ? {
                            id: String(debateDetails?.player2_id),
                            username: debateDetails?.player2_username,
                            elo: 0,
                            is_ai: false,
                        }
                        : {
                            id: String(debateDetails?.player1_id),
                            username: debateDetails?.player1_username,
                            elo: 0,
                            is_ai: false,
                        },
                topic: debateDetails.topic,
                messages: messagesRef.current,
                duration: 0,
                winner: null, // Winner is NOT yet available from the backend
                debateId: debateId,
            },
        });
    };

    const handleLeave = () => {
        if (socketRef.current) {
            socketRef.current.emit("leave_debate_room", {
                debateId: debateDetails?.id,
                userId: parseInt(String(user?.id), 10),
            });
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        navigate("/dashboard");
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-bg flex items-center justify-center text-cyber-red">
                Loading debate room...
            </div>
        );
    }

    const isCurrentPlayer1 = user?.id === String(debateDetails?.player1_id);

    const myUsername = isCurrentPlayer1
        ? debateDetails?.player1_username
        : debateDetails?.player2_username;
    const opponentUsername = !isCurrentPlayer1
        ? debateDetails?.player1_username
        : debateDetails?.player2_username;

    return (
        <div className="min-h-screen bg-gradient-bg text-foreground p-8 flex flex-col items-center">
            <Card className="max-w-3xl w-full bg-card/50 border-border/30 p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-border/50 pb-4 mb-4">
                    <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center">
                        <MessageCircle className="mr-2" /> Live Debate Room
                    </h2>
                    <Button variant="ghost" onClick={handleLeave}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Leave Room
                    </Button>
                </div>

                {debateDetails ? (
                    <div className="space-y-4">
                        <div className="text-center mb-4">
                            <p className="text-sm text-muted-foreground">
                                Debate ID: {debateDetails.id} | Topic:
                            </p>
                            <h3 className="text-xl font-semibold text-foreground">
                                {debateDetails.topic}
                            </h3>
                            <div className="flex justify-around items-center mt-2 text-sm text-muted-foreground">
                                <span>
                                    {myUsername} <Users className="inline-block h-4 w-4 ml-1" />
                                </span>
                                <span>vs</span>
                                <span>
                                    <Users className="inline-block h-4 w-4 mr-1" />{" "}
                                    {opponentUsername}
                                </span>
                            </div>
                        </div>

                        <div
                            className="chat-messages-box bg-background/50 border border-border/30 rounded-lg p-4 h-96 overflow-y-auto flex flex-col space-y-3"
                            ref={messagesEndRef}
                        >
                            {messages.length === 0 ? (
                                <p className="text-muted-foreground text-center py-12">
                                    No messages yet. Start the conversation!
                                </p>
                            ) : (
                                messages.map((msg, index) => (
                                    <div
                                        key={msg.id || index}
                                        className={`flex ${
                                            msg.sender_id === parseInt(user?.id, 10)
                                                ? "justify-end"
                                                : "justify-start"
                                        }`}
                                    >
                                        <Card
                                            className={`max-w-[70%] p-3 text-sm rounded-lg ${
                                                msg.sender_id === parseInt(user?.id, 10)
                                                    ? "bg-gradient-primary text-primary-foreground"
                                                    : "bg-gradient-card border-border/50"
                                            }`}
                                        >
                                            <p className="font-semibold mb-1">
                                                {msg.sender_id === parseInt(user?.id, 10)
                                                    ? "You"
                                                    : msg.sender_id === 0
                                                    ? "AI Bot"
                                                    : msg.sender_id === debateDetails.player1_id
                                                    ? debateDetails.player1_username
                                                    : debateDetails.player2_username}
                                            </p>
                                            <p className="leading-relaxed">{msg.content}</p>
                                            <p className="text-xs mt-1 opacity-70">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </p>
                                        </Card>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex space-x-3">
                            <Input
                                type="text"
                                placeholder={
                                    isDebateActive ? "Type your message..." : "Debate has ended"
                                }
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={handleKeyPress}
                                disabled={!isDebateActive}
                                className="flex-1 bg-input/50 border-border/50 focus:border-cyber-red"
                            />
                            <Button
                                onClick={sendMessage}
                                disabled={!messageInput.trim() || !isDebateActive}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>

                        {isDebateActive && (
                            <div className="flex justify-end mt-2">
                                <Button variant="outline" onClick={endDebate}>
                                    End Debate
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-muted-foreground">Loading debate...</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ChatRoom;
