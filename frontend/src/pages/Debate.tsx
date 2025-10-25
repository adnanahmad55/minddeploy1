// Debate.tsx - FINAL COMPLETE CODE (Corrected UI Player Alignment)

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
    const { user, token } = useAuth(); // Get current logged-in user details
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [timeLeft, setTimeLeft] = useState(300); // 15 minutes = 900 seconds
    const [isDebateActive, setIsDebateActive] = useState(true);
    const [isTyping, setIsTyping] = useState(false); // For AI opponent typing indicator
    const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for scrolling to bottom

    // Safely get state from location, providing defaults
    const opponent: Opponent = location.state?.opponent || { id: '0', username: 'Opponent', elo: 1000, is_ai: false };
    const topic: string = location.state?.topic || 'Default Topic';
    // Ensure debateId is consistently treated as a number
    const debateId = typeof location.state?.debateId === 'number'
        ? location.state.debateId
        : parseInt(String(location.state?.debateId || 'NaN'), 10);

    const socketRef = useRef<Socket | null>(null);
    // Refs to access current state within timer/cleanup callbacks where state might be stale
    const messagesRef = useRef(messages);
    const timeLeftRef = useRef(timeLeft);

    // Keep refs updated with the latest state
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

    // --- Socket Connection and Event Handling ---
    useEffect(() => {
        // Validate essential data before attempting connection
        if (isNaN(debateId) || !user || !token) {
            console.error("Debate Init Error - Missing Data:", { debateId, user_exists: !!user, token_exists: !!token });
            toast({ title: "Error", description: "Invalid debate session or user not logged in.", variant: "destructive" });
            navigate('/dashboard'); // Redirect if critical data is missing
            return; // Stop execution of the effect
        }

        // Initialize socket only once per component mount (and if user/token/debateId are valid)
        if (!socketRef.current) {
             console.log(`Initializing socket for Debate ID: ${debateId}, User ID: ${user.id}`);
             // Connect using the API base URL, send token for auth, force polling
             socketRef.current = io(API_BASE, {
                auth: { token: token },
                transports: ['polling']
            });

            // --- Event Listeners Setup ---
            socketRef.current.on('connect', () => {
                console.log('Socket connected successfully using Polling.');
                // Join the specific debate room after connecting
                // Send user ID too, might be useful for backend room management
                socketRef.current?.emit('join_debate_room', { debateId: debateId, userId: user.id });
                console.log(`Attempted to join room: ${debateId}`);
                // Fetch initial messages *after* attempting to join the room
                fetchInitialMessages();
            });

            socketRef.current.on('room_joined', (data) => {
                console.log(">>> CONFIRMATION: Successfully joined room:", data);
                // Can potentially trigger UI changes if needed
            });

            // --- Real-time Message Update Handler ---
            socketRef.current.on('new_message', (incomingMessage: any) => {
                console.log('>>> DEBUG: Raw new_message received:', incomingMessage);
                // Basic validation of incoming message structure
                if (!incomingMessage || typeof incomingMessage.id === 'undefined' || typeof incomingMessage.timestamp === 'undefined') {
                    console.error(">>> DEBUG: Invalid message structure received:", incomingMessage);
                    return; // Ignore invalid messages
                }
                // Format the message to match the frontend's Message interface
                const formattedMessage: Message = {
                    ...incomingMessage,
                    id: String(incomingMessage.id), // Ensure ID is a string
                    sender_id: incomingMessage.sender_id !== null ? Number(incomingMessage.sender_id) : null,
                    timestamp: new Date(incomingMessage.timestamp) // Convert ISO string to Date object
                };

                // Use functional update for setMessages to ensure latest state is used
                setMessages((prevMessages) => {
                    // Check if message with this ID already exists to prevent duplicates
                    if (prevMessages.some(msg => msg.id === formattedMessage.id)) {
                        console.log(`>>> DEBUG setMessages: Duplicate ID ${formattedMessage.id} found, skipping.`);
                        return prevMessages; // Return the unchanged state
                    }
                    // Add the new message to the array
                    const newState = [...prevMessages, formattedMessage];
                    console.log(`>>> DEBUG setMessages: New message added. New count: ${newState.length}`);
                    return newState; // Return the new state array
                });
            });

            // Listener for AI typing indicator
            socketRef.current.on('ai_typing', (data) => {
                if (data.debateId === debateId) {
                     console.log("AI Typing status:", data.is_typing);
                     setIsTyping(data.is_typing); // Update typing state
                }
            });

            // Listener for when the debate ends (triggered by timer or manual end)
            socketRef.current.on('debate_ended', (data) => {
                 console.log('Debate ended event received from server:', data);
                 setIsDebateActive(false); // Stop input and timer visually
                 toast({ title: "Debate Over", description: `Winner: ${data?.winner || 'Undetermined'}. Check results.`});
                 // Consider navigating to results page automatically or enabling the button
                 // navigate('/Result', { state: { ...data, opponent, topic, messages: messagesRef.current } });
            });

            // Handle socket connection errors
            socketRef.current.on('connect_error', (error) => {
                console.error("Socket Connection Error:", error);
                toast({ title: "Connection Error", description: `Failed to connect: ${error.message}`, variant: "destructive" });
                 // Consider more robust error handling, e.g., retry attempts or navigating back
            });

            // Handle generic errors emitted by the server
             socketRef.current.on('error', (errorData) => {
                  console.error("Socket Server Error:", errorData);
                  toast({ title: "Server Error", description: errorData?.detail || "An error occurred on the server.", variant: "destructive"})
             });
        }

        // --- Cleanup Function ---
        // This runs when the component unmounts or dependencies change
        return () => {
            if (socketRef.current) {
                console.log("Cleaning up socket connection and listeners.");
                // Remove all listeners to prevent memory leaks
                socketRef.current.off('connect');
                socketRef.current.off('room_joined');
                socketRef.current.off('new_message');
                socketRef.current.off('ai_typing');
                socketRef.current.off('debate_ended');
                socketRef.current.off('connect_error');
                socketRef.current.off('error');
                // Notify backend that user is leaving the room
                socketRef.current.emit('leave_debate_room', { debateId: debateId });
                // Disconnect the socket
                socketRef.current.disconnect();
                socketRef.current = null; // Clear the ref
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debateId, user, token]); // Dependencies: Re-run if these change


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
             setMessages(formattedMessages); // Set initial messages
             console.log("Initial messages fetched and formatted:", formattedMessages);
         } catch (error) {
             console.error("Error fetching initial messages:", error);
             toast({ title: "Error loading history", description: "Could not fetch messages.", variant: "destructive" });
         }
     };

    // --- Timer ---
    useEffect(() => {
        if (!isDebateActive) return; // Don't run timer if debate has ended

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { // If time is about to run out
                    setIsDebateActive(false); // Stop the debate
                    toast({ title: "Debate finished!", description: "Time's up! Calculating results...", });
                    clearInterval(timer); // Clear the interval
                    // Emit end_debate event to backend if time runs out
                    socketRef.current?.emit('end_debate', { debate_id: debateId });
                    return 0; // Set time to 0
                }
                return prev - 1; // Decrement time
            });
        }, 1000); // Run every second

        // Cleanup interval on component unmount or when debate ends
        return () => clearInterval(timer);
    }, [debateId, isDebateActive]); // Dependencies


    // --- Scroll to Bottom ---
    useEffect(() => {
        // Scroll smoothly to the bottom when messages or typing status change
        // Added a slight delay to allow DOM update before scrolling
        const scrollTimeout = setTimeout(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        return () => clearTimeout(scrollTimeout); // Cleanup timeout
    }, [messages, isTyping]);


    // --- Send Message ---
    const sendMessage = async () => {
        // Validate inputs and state before sending
        if (!currentMessage.trim() || !isDebateActive || !user || isNaN(debateId) || !socketRef.current?.connected) {
             console.warn("Cannot send message:", { currentMessage, isDebateActive, user, debateId, socketConnected: socketRef.current?.connected });
             if (!socketRef.current?.connected) {
                  toast({ title: "Not Connected", description:"Please wait or try refreshing.", variant:"destructive"});
             }
             return;
        }

        const currentUserId = parseInt(String(user.id), 10);
        if (isNaN(currentUserId)){
             console.error("Invalid user ID for sending message:", user.id);
             return; // Stop if user ID is not a valid number
        }

        // Data structure for BOTH AI API and Socket.IO emit
        const messagePayload = {
             debateId: debateId,
             senderId: currentUserId, // Use number
             content: currentMessage,
             senderType: 'user' as const // Use literal type for type safety
        };
        // Specific payload for AI API if it differs (e.g., uses sender_id)
        const aiApiPayload = {
             content: currentMessage,
             sender_type: 'user' as const,
             sender_id: currentUserId
        };

        // --- REMOVED OPTIMISTIC UI UPDATE ---
        // Rely solely on 'new_message' event from server
        // --- END REMOVAL ---

        const messageInputBeforeSending = currentMessage; // Store message in case of failure
        setCurrentMessage(''); // Clear input immediately

        // Check if opponent is AI or Human
        if (opponent?.is_ai) {
            console.log("Sending message to AI debate endpoint...");
            setIsTyping(true); // Assume AI will start typing
            try {
                // Ensure topic is available and properly encoded for the URL
                const encodedTopic = encodeURIComponent(topic || 'Unknown Topic');
                const response = await fetch(`${API_BASE}/ai-debate/${debateId}/${encodedTopic}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`, // Use current token
                    },
                    body: JSON.stringify(aiApiPayload), // Send payload needed by AI route
                });
                if (!response.ok) {
                    // Handle API error
                    const errorText = await response.text();
                    console.error("Error response from AI API:", response.status, errorText);
                    toast({ title: "Error", description: `AI response error: ${response.status}`, variant: "destructive" });
                    setCurrentMessage(messageInputBeforeSending); // Restore input on failure
                    setIsTyping(false); // Stop typing indicator on error
                    return; // Stop processing
                }
                console.log("AI API call successful, waiting for socket message for AI response.");
                // AI's response will arrive via the 'new_message' socket event

            } catch (error) {
                // Handle network or other fetch errors
                console.error("Fetch error sending to AI API:", error);
                toast({ title: "Network Error", description: "Failed to send message to AI.", variant: "destructive" });
                setCurrentMessage(messageInputBeforeSending); // Restore input on failure
                setIsTyping(false); // Stop typing indicator on error
            }
            // Note: setIsTyping(false) should ideally be handled when AI message arrives or via a specific event
        } else {
            // Send message to human opponent via Socket.IO
            console.log("Sending message to human opponent via socket...");
            socketRef.current?.emit('send_message_to_human', messagePayload);
            // Server will broadcast the message back via 'new_message' event to all in the room
        }
    };

    // --- Handle Enter Key Press for Sending Message ---
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            e.preventDefault(); // Prevent default newline behavior in input
            sendMessage();
        }
    };

    // --- End Debate Manually ---
    const endDebate = () => {
        if (isNaN(debateId)) return; // Ensure debateId is valid
        setIsDebateActive(false); // Visually end the debate
        toast({ title: "Debate ended by user", description: "Calculating results...", });
        // Notify the backend that the debate has ended
        socketRef.current?.emit('end_debate', { debate_id: debateId });
        // Consider navigating based on 'debate_ended' event instead for consistency
        // navigate('/Result', { state: { ... } });
    };

    // --- Forfeit ---
     const forfeit = () => {
         // Ensure debateId and user are valid
         if(isNaN(debateId) || !user) return;
         toast({ title: "Debate forfeited", description: "Leaving the arena.", variant: "destructive" });
         // socketRef.current?.emit('forfeit_debate', { debate_id: debateId, user_id: parseInt(user.id, 10) }); // Optional
         navigate('/dashboard'); // Navigate immediately
     };

    // --- Helper to format time (MM:SS) ---
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // --- Render ---
    return (
        <div className="min-h-screen bg-gradient-bg flex flex-col text-white"> {/* Base text color */}
            {/* Header */}
            <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-3">
                    {/* Top Row: Back Button, Title, Timer */}
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={forfeit} disabled={!isDebateActive}>
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
                    {/* Topic Row */}
                    <div className="mt-3 text-center">
                        <p className="text-sm text-muted-foreground">Debate Topic:</p>
                        <p className="text-lg font-semibold text-foreground">{topic}</p>
                    </div>
                </div>
            </header>

            {/* --- CRITICAL UI FIX: Player Info Section - SWAPPED --- */}
            <div className="border-b border-border/50 bg-muted/10">
                 <div className="container mx-auto px-4 py-3">
                     <div className="flex items-center justify-between">
                         {/* OPPONENT NOW ON THE LEFT */}
                         <div className="flex items-center space-x-3">
                             <div className={`p-2 rounded-lg ${opponent?.is_ai ? 'bg-cyber-gold/20' : 'bg-cyber-red/20'}`}>
                                 {opponent?.is_ai ? <Bot className="h-5 w-5 text-cyber-gold" /> : <Sword className="h-5 w-5 text-cyber-red" />}
                             </div>
                             <div>
                                 <p className="font-semibold text-foreground">{opponent?.username ?? 'Opponent'}</p>
                                 <p className="text-sm text-muted-foreground">{opponent?.elo ?? '?'} ELO</p>
                             </div>
                         </div>

                         {/* VS Separator */}
                         <div className="text-center"> <div className="text-2xl">⚔️</div> <p className="text-xs text-muted-foreground">VS</p> </div>

                         {/* CURRENT USER NOW ON THE RIGHT */}
                         <div className="flex items-center space-x-3">
                             <div>
                                 <p className="font-semibold text-foreground text-right">{user?.username ?? 'You'}</p>
                                 <p className="text-sm text-muted-foreground text-right">{user?.elo ?? '?'} ELO</p>
                             </div>
                             <div className="p-2 bg-cyber-blue/20 rounded-lg"> <Shield className="h-5 w-5 text-cyber-blue" /> </div>
                         </div>
                     </div>
                 </div>
            </div>
             {/* --- END CRITICAL UI FIX --- */}


            {/* Message Area */}
            <div className="flex-1 overflow-hidden"> {/* Allows inner div to scroll */}
                <div className="h-full flex flex-col container mx-auto px-4 py-4"> {/* Container with padding */}
                    {/* Message Scroll Container */}
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"> {/* Scrollable area */}
                        {/* Initial Prompt when no messages */}
                        {messages.length === 0 && !isTyping && (
                            <div className="text-center py-12 text-muted-foreground opacity-50">
                                <Brain className="h-12 w-12 mx-auto mb-4" />
                                <p>Begin the discourse...</p>
                            </div>
                        )}

                        {/* Map through messages */}
                        {messages.map((message) => {
                             // Correctly determine if the message is from the current logged-in user
                             const currentUserIdNum = user ? parseInt(String(user.id), 10) : NaN;
                             // Check if sender_id is not null before comparing
                             const isCurrentUser = message.sender_id !== null && message.sender_id === currentUserIdNum;

                             return (
                                <div
                                    key={message.id} // Use unique message ID from backend/optimistic
                                    className={`flex w-full ${isCurrentUser ? 'justify-end' : 'justify-start'}`} // Alignment Fix
                                >
                                    {/* Message Bubble */}
                                    <div className={`max-w-[70%] lg:max-w-[60%] p-3 rounded-lg shadow-md break-words ${ // Ensure long words break
                                        isCurrentUser
                                        ? 'bg-gradient-primary text-primary-foreground' // Your style
                                        : 'bg-gradient-card border border-border/50 text-gray-300' // Opponent style
                                    }`}>
                                        {/* Message Content */}
                                        <p className="text-sm leading-relaxed">{message.content}</p>
                                        {/* Timestamp */}
                                        <p className={`text-xs mt-2 opacity-70 text-right ${
                                             isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                        }`}>
                                            {/* Format Date object, show placeholder if invalid */}
                                            {message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '...'}
                                        </p>
                                    </div>
                                </div>
                             );
                        })}

                        {/* AI Typing Indicator */}
                        {isTyping && opponent?.is_ai && (
                            <div className="flex justify-start">
                                <Card className="bg-gradient-card border-border/50 p-3 inline-block">
                                    <div className="flex space-x-1 items-center">
                                         {/* Animated typing dots */}
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse"></div>
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse animation-delay-200"></div>
                                         <div className="w-2 h-2 bg-cyber-gold rounded-full animate-pulse animation-delay-400"></div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Empty div at the end to target for scrolling */}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="border-t border-border/50 pt-4">
                        {/* Input field and Send button */}
                        <div className="flex space-x-3">
                            <Input
                                value={currentMessage}
                                onChange={(e) => setCurrentMessage(e.target.value)}
                                onKeyPress={handleKeyPress} // Handle Enter key press
                                placeholder={isDebateActive ? "Your argument..." : "Debate has ended"}
                                disabled={!isDebateActive} // Disable input if debate is over
                                className="flex-1 bg-input/50 border-border/50 focus:border-cyber-red"
                                autoComplete="off" // Disable browser autocomplete
                            />
                            <Button
                                onClick={sendMessage}
                                disabled={!currentMessage.trim() || !isDebateActive} // Disable if input empty or debate ended
                                size="icon"
                                className="bg-cyber-red hover:bg-cyber-red/80"
                                aria-label="Send message" // Accessibility label
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                        {/* Helper text and End Debate button (only if active) */}
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
                         {/* View Results button (only if ended and messages exist) */}
                         {!isDebateActive && messages.length > 0 && (
                             <div className="text-center mt-4">
                                {/* Pass necessary state to results page */}
                                <Button onClick={() => navigate('/Result', { state: { debateId, opponent, topic, messages: messagesRef.current }})}>
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