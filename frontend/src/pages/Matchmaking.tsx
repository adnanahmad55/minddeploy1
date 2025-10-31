import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext'; // Path alias used
import { toast } from '@/hooks/use-toast';
import { Brain, Swords, Users, Zap, Clock, ArrowLeft, Bot } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// NOTE: VITE_API_URL should be the base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Opponent {
    id: string;
    username: string;
    elo: number;
    is_ai: boolean;
}

const Matchmaking = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [isSearching, setIsSearching] = useState(false);
    const [searchTime, setSearchTime] = useState(0);
    const [topic, setTopic] = useState<string>(''); // To display the topic while searching
    const socketRef = useRef<Socket | null>(null);
    const timerRef = useRef<number | null>(null);

    // --- Socket.IO Connection Setup ---
    useEffect(() => {
        // Only connect if user is logged in
        if (!socketRef.current && user && token) {
             // Ensure socketUrl has HTTPS protocol for production stability
             const socketUrl = API_BASE.startsWith('http') ? API_BASE : `https://${API_BASE}`;

             console.log("Setting up Socket.IO connection for matchmaking...");
             socketRef.current = io(socketUrl, {
                auth: { token: token },      // Send token for authentication
                // ✅ FINAL FIX: Use WebSocket only to bypass 400 xhr poll error
                transports: ['websocket'],   
                upgrade: false            
            });

            // --- Event Listeners ---
            socketRef.current.on('connect', () => {
                console.log("Socket.IO connected successfully using WebSocket.");
                // Emit user_online AFTER connecting to register presence
                if (user) {
                     socketRef.current?.emit('user_online', {
                        userId: user.id,
                        username: user.username,
                        elo: user.elo
                    });
                     console.log("Emitted user_online event.");
                }
            });

            socketRef.current.on('match_found', (data) => {
                console.log('Match found event received:', data);
                stopSearching(); // Stop the timer and searching state
                toast({
                    title: "Match Found!",
                    description: `Debating ${data.opponent?.username || 'opponent'} on: ${data.topic || 'topic'}`,
                });
                // Navigate to the debate page with necessary state
                 // Note: We need to use the Debate ID from the backend to construct the URL
                navigate(`/debate/${data.debate_id}`, { state: { opponent: data.opponent, topic: data.topic } });
            });

            socketRef.current.on('connect_error', (error) => {
                console.error("Matchmaking Socket Connection Error:", error);
                toast({ title: "Connection Error", description: `Failed to connect: ${error.message}`, variant: "destructive" });
                stopSearching(); // Stop searching if connection fails
            });

             socketRef.current.on('error', (errorData) => {
                  console.error("Matchmaking Socket Server Error:", errorData);
                  toast({ title: "Server Error", description: errorData?.detail || "An error occurred.", variant: "destructive"})
                  // Decide if searching should stop based on the error
             });

        }

        // --- Cleanup Function ---
        return () => {
            if (socketRef.current) {
                console.log("Cleaning up matchmaking socket connection.");
                // Notify backend user is going offline
                socketRef.current.emit('user_offline', { userId: user?.id });
                // If user was searching, cancel it
                socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
                // Remove listeners and disconnect
                socketRef.current.off('connect');
                socketRef.current.off('match_found');
                socketRef.current.off('connect_error');
                socketRef.current.off('error');
                socketRef.current.disconnect();
                socketRef.current = null; // Clear the ref
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, token, navigate]); // Dependencies: Re-run if user or token changes


    // --- Timer Logic ---
    useEffect(() => {
        if (isSearching) {
            // Start timer when searching begins
            timerRef.current = setInterval(() => {
                setSearchTime(prev => prev + 1);
            }, 1000) as unknown as number;
        } else if (timerRef.current) {
            // Clear timer if searching stops
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        // Cleanup interval on unmount or when isSearching changes
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isSearching]); // Dependency: Run when isSearching changes


    // --- Stop Searching Function ---
    const stopSearching = () => {
        setIsSearching(false); // Update state to stop showing search UI
        setSearchTime(0);      // Reset timer display
        setTopic('');          // Clear topic display
        // Notify backend to remove user from queue
        if (socketRef.current) {
            socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
            console.log("Emitted cancel_matchmaking event.");
        }
        // Clear the interval timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // --- Format Time Helper ---
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // --- Start Matchmaking Function (Handles button clicks) ---
    const startMatchmaking = async (isAI: boolean) => {
        // Prevent starting if already searching or user not loaded
        if (!user || !token || isSearching) {
             console.warn("Cannot start matchmaking:", { user_exists: !!user, token_exists: !!token, isSearching });
             return;
        }
        
        // Ensure socket is connected before trying to start (critical)
        if (!socketRef.current?.connected) {
            toast({title:"Connection Required", description:"Connecting to server now. Please try again.", variant:"destructive"});
            socketRef.current?.connect(); // Attempt to reconnect
            return;
        }

        setIsSearching(true); // Show searching UI
        setSearchTime(0);      // Reset timer
        setTopic('');          // Clear topic display initially
        console.log(`DEBUG: Starting matchmaking (isAI: ${isAI})`);

        try {
            // Determine the correct API endpoint based on AI choice
            const endpoint = isAI ? `${API_BASE}/ai-debate/start` : `${API_BASE}/debate/start-human`;
            console.log(`DEBUG: Calling API endpoint: ${endpoint}`);

            // Call the backend API to initiate the debate creation (backend chooses topic)
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, // Send auth token
                },
            });
            console.log(`DEBUG: API response status: ${response.status}`);

            // Handle API errors (e.g., 401 Unauthorized, 500 Server Error)
            if (!response.ok) {
                 console.error("DEBUG: API response not OK");
                 let errorDetail = `Matchmaking start failed: ${response.status}`;
                 try { const err = await response.json(); errorDetail = err.detail || errorDetail; } catch (e) { console.warn("Could not parse error JSON"); }
                 throw new Error(errorDetail); // Throw error to be caught below
            }

            // If API call is successful, get the debate data (including ID and topic)
            const data = await response.json();
            console.log("DEBUG: API response data:", data);

            // Set the topic received from the backend to display while searching (for human)
            setTopic(data.topic);

            // Handle AI vs Human path
            if (isAI) {
                // For AI matches, navigate immediately using the received data
                 console.log("DEBUG: Handling AI match navigation...");
                 stopSearching(); // Stop searching UI/timer
                 // Navigate to the specific debate ID URL
                 navigate(`/debate/${data.id}`, {
                     state: {
                         opponent: { id: '1', username: 'AI Bot', elo: 1200, is_ai: true }, // Define AI opponent
                         topic: data.topic // Pass the topic
                     }
                 });
            } else {
                // For human matches, emit event to join the queue with the debate ID
                 console.log("DEBUG: Handling Human match, emitting join_matchmaking_queue...");
                 // Check if socket is connected before emitting
                 if (socketRef.current?.connected) {
                     socketRef.current?.emit('join_matchmaking_queue', {
                        userId: user.id,
                        elo: user.elo,
                        debateId: data.id // Use debateId from backend response
                    });
                     console.log("DEBUG: Emitted join_matchmaking_queue.");
                 } else {
                      console.error("Cannot emit join_matchmaking_queue: Socket not connected.");
                      toast({title:"Connection Error", description:"Cannot join queue, not connected.", variant:"destructive"});
                      stopSearching(); // Stop if socket isn't ready
                 }
            }

        } catch (error) {
            // Catch errors from fetch or data processing
            console.error("Matchmaking initiation failed inside catch block:", error);
            toast({
                title: "Matchmaking Error",
                description: `Could not start search: ${error instanceof Error ? error.message : "Unknown error"}`,
                variant: "destructive",
            });
            stopSearching(); // Ensure searching stops on any error
        }
    };

    // --- Render ---
    return (
        <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4 text-white"> {/* Base text color */}
            {/* Back Button */}
            <div className="absolute top-4 left-4">
                <Button variant="ghost" onClick={() => navigate('/dashboard')} disabled={isSearching}> {/* Disable back if searching */}
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
            </div>

            {/* Main Card */}
            <Card className="max-w-md w-full bg-card/50 border-border/50 p-6 sm:p-8 shadow-cyber"> {/* Added responsive padding */}
                {/* Header */}
                <CardHeader className="text-center border-b border-border/50 pb-4 mb-6">
                    <CardTitle className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center justify-center">
                        <Swords className="mr-2 sm:mr-3 h-6 w-6 sm:h-7 sm:h-7" /> Neural Matchmaking
                    </CardTitle>
                </CardHeader>

                {/* Content */}
                <CardContent className="space-y-6">
                    {/* User Info */}
                    <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                            Current ELO: {user?.elo ?? '...'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Mind Tokens: {user?.mind_tokens ?? '...'}
                        </p>
                    </div>

                    {/* Conditional Rendering: Buttons or Searching UI */}
                    {!isSearching ? (
                        // Buttons Section
                        <div className="space-y-4">
                            <Button
                                size="lg"
                                className="w-full bg-cyber-red hover:bg-cyber-red/80 text-white font-semibold" // Ensure text is visible
                                onClick={() => startMatchmaking(false)}
                                disabled={!user} // Disable if user data isn't loaded yet
                            >
                                <Users className="mr-2 h-5 w-5" /> Debate a Human Opponent
                            </Button>
                            <Button
                                size="lg"
                                variant="secondary" // Use secondary styling
                                className="w-full bg-cyber-blue hover:bg-cyber-blue/80 text-white font-semibold" // Ensure text is visible
                                onClick={() => startMatchmaking(true)}
                                disabled={!user} // Disable if user data isn't loaded yet
                            >
                                <Bot className="mr-2 h-5 w-5" /> Debate the AI
                            </Button>
                        </div>
                    ) : (
                        // Searching Section
                        <div className="text-center space-y-4">
                            {/* Animated Spinner */}
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                                <div className="absolute inset-0 border-4 border-cyber-gold/30 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-cyber-gold border-t-transparent rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-cyber-gold">
                                    <Swords className="h-8 w-8 sm:h-10 sm:w-10 animate-pulse" />
                                </div>
                            </div>
                            {/* Status Text */}
                            <p className="text-lg font-semibold text-foreground">
                                Searching for Opponent...
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Topic: {topic || 'Determining topic...'}
                            </p>
                            {/* Timer */}
                            <p className="text-sm font-mono text-cyber-red flex items-center justify-center">
                                <Clock className="h-4 w-4 mr-1" /> Elapsed: {formatTime(searchTime)}
                            </p>
                            {/* Cancel Button */}
                            <Button variant="outline" onClick={stopSearching} className="w-full">
                                Cancel Search
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Matchmaking;
