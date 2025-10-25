// Debate.tsx - FINAL COMPLETE CODE (Alignment & Real-time - No Optimistic)

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card'; // Keep Card if used
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
    Brain, Send, Clock, Users, Bot, ArrowLeft, Shield, Sword
} from 'lucide-react';
import io, { Socket } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Message {
    id: string;
    content: string;
    sender_id: number | null;
    sender_type: 'user' | 'ai';
    debate_id: number;
    timestamp: Date;
}

interface Opponent {
    id: string;
    username: string;
    elo: number;
    is_ai: boolean;
}

const Debate = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [timeLeft, setTimeLeft] = useState(900); // 15 minutes = 900 seconds
    const [isDebateActive, setIsDebateActive] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Safely get state with defaults, ensuring debateId is parsed correctly
    const opponent: Opponent = location.state?.opponent || { id: '0', username: 'Opponent', elo: 1000, is_ai: false };
    const topic: string = location.state?.topic || 'Default Topic';
    const debateId = typeof location.state?.debateId === 'number'
        ? location.state.debateId
        : parseInt(String(location.state?.debateId || 'NaN'), 10);

    const socketRef = useRef<Socket | null>(null);
    const messagesRef = useRef(messages); // Ref to access current messages in callbacks
    const timeLeftRef = useRef(timeLeft); // Ref to access current time in callbacks

    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

    // --- Socket Connection and Event Handling ---
    useEffect(() => {
        // Validate essential data before attempting connection
        if (isNaN(debateId) || !user || !token) {
            console.error("Debate Init Error - Missing Data:", { debateId, user_exists: !!user, token_exists: !!token });
            toast({ title: "Error", description: "Invalid debate session or user not logged in.", variant: "destructive" });
            navigate('/dashboard'); // Redirect if critical data is missing
            return;
        }

        // Initialize socket only once
        if (!socketRef.current) {
             console.log(`Initializing socket for Debate ID: ${debateId}, User ID: ${user.id}`);
             socketRef.current = io(API_BASE, {
                auth: { token: token },      // Send token for authentication
                transports: ['polling']      // Force polling for stability
            });

            // --- Event Listeners ---
            socketRef.current.on('connect', () => {
                console.log('Socket connected successfully using Polling.');
                // Join the specific debate room after connecting
                socketRef.current?.emit('join_debate_room', { debateId: debateId });
                console.log(`Attempted to join room: ${debateId}`);
                // Fetch initial messages *after* attempting to join the room
                fetchInitialMessages();
            });

            socketRef.current.on('new_message', (incomingMessage: any) => {
                console.log('Received new message:', incomingMessage);
                // Basic validation
                if (!incomingMessage || typeof incomingMessage.id === 'undefined' || typeof incomingMessage.timestamp === 'undefined') {
                    console.error("Invalid message structure received:", incomingMessage);
                    return;
                }
                const formattedMessage: Message = {
                    ...incomingMessage,
                    id: String(incomingMessage.id),
                    sender_id: incomingMessage.sender_id !== null ? Number(incomingMessage.sender_id) : null,
                    timestamp: new Date(incomingMessage.timestamp) // Convert ISO string to Date
                };

                // Update state, preventing duplicates
                setMessages((prevMessages) => {
                    if (prevMessages.some(msg => msg.id === formattedMessage.id)) {
                        console.log(`Duplicate message ID ${formattedMessage.id} detected, skipping.`);
                        return prevMessages;
                    }
                    console.log(`Adding new message ID ${formattedMessage.id}.`);
                    return [...prevMessages, formattedMessage];
                });
            });

            socketRef.current.on('ai_typing', (data) => {
                if (data.debateId === debateId) {
                     console.log("AI Typing status:", data.is_typing);
                     setIsTyping(data.is_typing);
                }
            });

            socketRef.current.on('debate_ended', (data) => {
                 console.log('Debate ended event received:', data);
                 setIsDebateActive(false);
                 // You might want to navigate to results or show a modal here based on 'data'
                 // Example: navigate('/Result', { state: { ...data, opponent, topic } });
                 toast({ title: "Debate Over", description: `Winner: ${data?.winner || 'Undetermined'}. View results page.`});
            });

            socketRef.current.on('connect_error', (error) => {
                console.error("Socket Connection Error:", error);
                toast({ title: "Connection Error", description: `Failed to connect: ${error.message}`, variant: "destructive" });
            });

            socketRef.current.on('error', (errorData) => {
                 console.error("Socket Server Error:", errorData);
                 toast({ title: "Server Error", description: errorData?.detail || "An error occurred.", variant: "destructive"})
            });
        }

        // --- Cleanup Function ---
        return () => {
            if (socketRef.current) {
                console.log("Cleaning up socket connection and listeners.");
                socketRef.current.off('connect');
                socketRef.current.off('new_message');
                socketRef.current.off('ai_typing');
                socketRef.current.off('debate_ended');
                socketRef.current.off('connect_error');
                socketRef.current.off('error');
                // Notify backend that user is leaving the room/debate
                socketRef.current.emit('leave_debate_room', { debateId: debateId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [debateId, user, token, navigate]); // Dependencies


    // --- Fetch Initial Messages ---
     const fetchInitialMessages = async () => {
         // Added check for NaN debateId
         if (isNaN(debateId) || !token) {
              console.error("Cannot fetch messages: Invalid debateId or no token.");
              return;
         }
         console.log("Fetching initial messages...");
         try {
             const response = await fetch(`${API_BASE}/debate/${debateId}/messages`, {
                 headers: { 'Authorization': `Bearer ${token}` }
             });
             if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
             const data = await response.json();
             // Format messages
             const formattedMessages = data.map((m: any) => ({
                 ...m,
                 id: String(m.id),
                 sender_id: m.sender_id !== null ? Number(m.sender_id) : null,
                 timestamp: new Date(m.timestamp)
             }));
             setMessages(formattedMessages);
             console.log("Initial messages fetched and formatted:", formattedMessages);
         } catch (error) {
             console.error("Error fetching initial messages:", error);
             toast({ title: "Error loading history", description: "Could not fetch messages.", variant: "destructive" });
         }
     };

    // --- Timer ---
    useEffect(() => {
        if (!isDebateActive) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setIsDebateActive(false);
                    toast({ title: "Debate finished!", description: "Time's up! Calculating results...", });
                    clearInterval(timer);
                    // Emit end_debate event only if time runs out
                    socketRef.current?.emit('end_debate', { debate_id: debateId });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [debateId, isDebateActive]);


    // --- Scroll to Bottom ---
    useEffect(() => {
        // Added a slight delay to allow DOM update before scrolling
        setTimeout(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, [messages, isTyping]); // Trigger on messages or typing status change


    // --- Send Message ---
    const sendMessage = async () => {
        // Added NaN check for debateId
        if (!currentMessage.trim() || !isDebateActive || !user || isNaN(debateId) || !socketRef.current) return;

        const currentUserId = parseInt(String(user.id), 10);
        if (isNaN(currentUserId)){
             console.error("Invalid user ID for sending message:", user.id);
             return;
        }

        // Data structure for BOTH AI API and Socket.IO emit
        const messagePayload = {
             debateId: debateId,
             senderId: currentUserId, // Use number
             content: currentMessage,
             senderType: 'user' as const // Use literal type
        };

        // --- FIX: REMOVED OPTIMISTIC UI UPDATE ---
        // We will rely solely on the 'new_message' event from the server
        // --- END FIX ---

        const messageInputBeforeSending = currentMessage; // Store message in case of failure
        setCurrentMessage(''); // Clear input immediately

        if (opponent?.is_ai) {
            console.log("Sending message to AI debate endpoint...");
            try {
                // Ensure topic is available and encoded
                const encodedTopic = encodeURIComponent(topic || 'Unknown Topic');
                const response = await fetch(`${API_BASE}/ai-debate/${debateId}/${encodedTopic}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    // Send required data for AI processing
                    body: JSON.stringify({
                         content: messagePayload.content,
                         sender_id: messagePayload.senderId, // Send sender_id if needed by backend
                         sender_type: messagePayload.senderType
                    }),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Error response from AI API:", response.status, errorText);
                    toast({ title: "Error", description: `AI response error: ${response.status}`, variant: "destructive" });
                    setCurrentMessage(messageInputBeforeSending); // Restore input on failure
                    return;
                }
                console.log("AI API call successful, waiting for socket message for AI response.");
                // AI response will arrive via the 'new_message' socket event

            } catch (error) {
                console.error("Fetch error sending to AI API:", error);
                toast({ title: "Network Error", description: "Failed to send message to AI.", variant: "destructive" });
                setCurrentMessage(messageInputBeforeSending); // Restore input on failure
            }
        } else {
            console.log("Sending message to human opponent via socket...");
            socketRef.current?.emit('send_message_to_human', messagePayload);
            // Server will broadcast the message back via 'new_message' event
        }
    };

    // --- Handle Enter Key Press ---
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent newline
            sendMessage();
        }
        // Add Shift+Enter handling if you want multi-line input later
    };

    // --- End Debate Manually ---
    const endDebate = () => {
        if (isNaN(debateId)) return;
        setIsDebateActive(false);
        toast({ title: "Debate ended by user", description: "Calculating results...", });
        socketRef.current?.emit('end_debate', { debate_id: debateId });
        // Consider navigating based on 'debate_ended' event instead for consistency
        // navigate('/Result', { state: { ... } });
    };

    // --- Forfeit ---
     const forfeit = () => {
         if(isNaN(debateId) || !user) return;
         toast({ title: "Debate forfeited", description: "Leaving the arena.", variant: "destructive" });
         // socketRef.current?.emit('forfeit_debate', { debate_id: debateId, user_id: parseInt(user.id, 10) }); // Optional
         navigate('/dashboard'); // Navigate immediately
     };

    // --- Helper to format time ---
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // --- Render ---
    return (
        <div className="min-h-screen bg-gradient-bg flex flex-col">
            {/* Header */}
            <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={forfeit} disabled={!isDebateActive}> {/* Disable forfeit if ended */}
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                        <div className="flex items-center space-x-3">
                            <Brain className="h-6 w-6 text-cyber-red" />
                            <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">Neural Battle</h1>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-cyber-gold" />
                            <span className={`font-mono text-lg ${timeLeft < 60 && isDebateActive ? 'text-cyber-red animate-pulse' : 'text-cyber-gold'}`}>
                                {formatTime(timeLeft)}
                            </span>
                        </div>
                    </div>
                    <div className="mt-3 text-center">
                        <p className="text-sm text-muted-foreground">Debate Topic:</p>
                        <p className="text-lg font-semibold text-foreground">{topic}</p>
                    </div>
                </div>
            </header>

            {/* Player Info */}
            <div className="border-b border-border/50 bg-muted/10">
                 <div className="container mx-auto px-4 py-3">
                     <div className="flex items-center justify-between">
                         {/* Current User */}
                         <div className="flex items-center space-x-3">
                             <div className="p-2 bg-cyber-blue/20 rounded-lg"> <Shield className="h-5 w-5 text-cyber-blue" /> </div>
                             <div>
                                 <p className="font-semibold text-foreground">{user?.username ?? 'You'}</p>
                                 <p className="text-sm text-muted-foreground">{user?.elo ?? '?'} ELO</p>
                             </div>
                         </div>
                         {/* VS */}
                         <div className="text-center"> <div className="text-2xl">⚔️</div> <p className="text-xs text-muted-foreground">VS</p> </div>
                         {/* Opponent */}
                         <div className="flex items-center space-x-3">
                             <div>
                                 <p className="font-semibold text-foreground text-right">{opponent?.username ?? 'Opponent'}</p> {/* Use opponent from state */}
                                 <p className="text-sm text-muted-foreground text-right">{opponent?.elo ?? '?'} ELO</p>
                             </div>
                             <div className={`p-2 rounded-lg ${opponent?.is_ai ? 'bg-cyber-gold/20' : 'bg-cyber-red/20'}`}>
                                 {opponent?.is_ai ? <Bot className="h-5 w-5 text-cyber-gold" /> : <Sword className="h-5 w-5 text-cyber-red" />}
                             </div>
                         </div>
                     </div>
                 </div>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-hidden">
                <div className="h-full flex flex-col container mx-auto px-4 py-4">
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"> {/* Added scrollbar style */}
                        {messages.length === 0 && !isTyping && (
                            <div className="text-center py-12 text-muted-foreground opacity-50">
                                <Brain className="h-12 w-12 mx-auto mb-4" />
                                <p>Begin the discourse...</p>
                            </div>
                        )}

                        {messages.map((message) => {
                             // --- CRITICAL UI FIX: Compare sender_id with current user's ID ---
                             const currentUserIdNum = user ? parseInt(String(user.id), 10) : NaN;
                             // Check if sender_id is not null before comparing
                             const isCurrentUser = message.sender_id !== null && message.sender_id === currentUserIdNum;
                             // --- END CRITICAL UI FIX ---

                             return (
                                <div
                                    key={message.id} // Ensure ID is unique (using temp ID for optimistic)
                                    className={`flex w-full ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                                >
                                    {/* Message Card */}
                                    <div className={`max-w-[70%] lg:max-w-[60%] p-3 rounded-lg shadow-md ${
                                        isCurrentUser
                                        ? 'bg-gradient-primary text-primary-foreground'
                                        : 'bg-gradient-card border border-border/50 text-gray-300' // Adjusted opponent color
                                    }`}>
                                        <p className="text-sm leading-relaxed break-words">{message.content}</p>
                                        <p className={`text-xs mt-2 opacity-70 text-right ${
                                             isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                        }`}>
                                            {/* Format Date object */}
                                            {message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Sending...'}
                                        </p>
                                    </div>
                                </div>
                             );
                        })}

                        {isTyping && ( // Show AI typing indicator
                            <div className="flex justify-start">
                                <Card className="bg-gradient-card border-border/50 p-3 inline-block">
                                    <div className="flex space-x-1 items-center">
                                         {/* Typing dots */}
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse"></div>
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse animation-delay-200"></div>
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse animation-delay-400"></div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        <div ref={messagesEndRef} /> {/* Scroll target */}
                    </div>

                    {/* Input Area */}
                    <div className="border-t border-border/50 pt-4">
                        <div className="flex space-x-3">
                            <Input
                                value={currentMessage}
                                onChange={(e) => setCurrentMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={isDebateActive ? "Your argument..." : "Debate has ended"}
                                disabled={!isDebateActive}
                                className="flex-1 bg-input/50 border-border/50 focus:border-cyber-red"
                                autoComplete="off" // Prevent browser suggestions
                            />
                            <Button
                                onClick={sendMessage}
                                disabled={!currentMessage.trim() || !isDebateActive}
                                size="icon"
                                className="bg-cyber-red hover:bg-cyber-red/80"
                                aria-label="Send message" // Accessibility
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                        {isDebateActive && (
                             <div className="flex justify-between items-center mt-3">
                                <p className="text-xs text-muted-foreground">
                                    Enter to send • Shift+Enter for new line
                                </p>
                                <Button variant="outline" size="sm" onClick={endDebate}>
                                    End Debate
                                </Button>
                            </div>
                        )}
                         {!isDebateActive && messages.length > 0 && (
                             <div className="text-center mt-4">
                                <Button onClick={() => navigate('/Result', { state: { debateId, opponent, topic, messages: messagesRef.current }})}> {/* Use Ref for final messages */}
                                    View Results
                                </Button>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Debate;