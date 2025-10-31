import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Swords, Users, Clock, ArrowLeft, Bot } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// NOTE: VITE_API_URL should be set to your backend's HTTPS URL
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
    const [topic, setTopic] = useState<string>('');
    const [statusMessage, setStatusMessage] = useState('Select an opponent type.');
    
    const socketRef = useRef<Socket | null>(null);
    const timerRef = useRef<number | null>(null);

    // --- Helper Functions ---
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const stopSearching = () => {
        stopTimer();
        setIsSearching(false);
        setSearchTime(0);
        setTopic('');
        setStatusMessage('Search cancelled.');
        if (socketRef.current) {
            socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
            console.log("Emitted cancel_matchmaking event.");
        }
    };
    
    const startTimer = () => {
        setSearchTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            setSearchTime(prev => prev + 1);
        }, 1000) as unknown as number;
    };

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // --- Socket.IO Connection Setup ---
    useEffect(() => {
        if (!socketRef.current && user && token) {
             const socketUrl = API_BASE.startsWith('http') ? API_BASE : `https://${API_BASE}`;
             
             console.log("Setting up Socket.IO connection for matchmaking...");
             
             socketRef.current = io(socketUrl, {
                auth: { token: token },
                // ✅ CRITICAL FIX: Only use WebSocket to bypass 400 xhr poll error
                transports: ['websocket'], 
                upgrade: false             
            });

            // --- Event Listeners ---
            socketRef.current.on('connect', () => {
                 console.log("Socket.IO connected successfully.");
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

            socketRef.current.on('match_found', (data: { debate_id: number; topic: string; opponent: Opponent }) => {
                console.log('Match found event received:', data);
                stopSearching();
                toast({
                    title: "Match Found!",
                    description: `Debating ${data.opponent?.username || 'opponent'} on: ${data.topic || 'topic'}`,
                });
                // Navigate to the debate page
                navigate(`/debate/${data.debate_id}`); 
            });

            socketRef.current.on('connect_error', (error) => {
                console.error("Matchmaking Socket Connection Error:", error);
                toast({ title: "Connection Error", description: `Failed to connect: ${error.message}`, variant: "destructive" });
                stopSearching(); 
            });

            socketRef.current.on('error', (errorData) => {
                 console.error("Matchmaking Socket Server Error:", errorData);
                 toast({ title: "Server Error", description: errorData?.detail || "An error occurred.", variant: "destructive"})
                 stopSearching();
             });
        }

        // --- Cleanup Function ---
        return () => {
            if (socketRef.current) {
                 console.log("Cleaning up matchmaking socket connection.");
                 socketRef.current.emit('user_offline', { userId: user?.id });
                 socketRef.current.emit('cancel_matchmaking', { userId: user?.id });
                 
                 // Remove listeners and disconnect
                 socketRef.current.off('connect');
                 socketRef.current.off('match_found');
                 socketRef.current.off('connect_error');
                 socketRef.current.off('error');
                 socketRef.current.disconnect();
                 socketRef.current = null;
            }
            stopTimer(); // Ensure timer stops on unmount
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, token, navigate, API_BASE]); 


    // --- Start Matchmaking Function ---
    const startMatchmaking = async (isAI: boolean) => {
        if (!user || !token || isSearching) return;

        setIsSearching(true);
        startTimer();
        setStatusMessage(isAI ? 'Initializing AI Debate...' : 'Searching for Human Opponent...');

        try {
            const endpoint = isAI ? `${API_BASE}/ai-debate/start` : `${API_BASE}/debate/start-human`;
            
            // Call the backend API to initiate the debate creation
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`, 
                },
            });

            if (!response.ok) {
                 let errorDetail = `Matchmaking start failed: ${response.status}`;
                 try { const err = await response.json(); errorDetail = err.detail || errorDetail; } catch (e) {}
                 throw new Error(errorDetail); 
            }

            const data = await response.json();
            
            if (isAI) {
                // For AI matches, navigate immediately
                stopSearching();
                navigate(`/debate/${data.id}`, { 
                    state: { 
                        debateId: data.id, 
                        opponent: { id: '1', username: 'AI Bot', elo: 1200, is_ai: true }, 
                        topic: data.topic 
                    } 
                });
            } else {
                // For human matches, emit event to join the queue with the debate ID
                setTopic(data.topic); // Display the chosen topic
                setStatusMessage('Opponent search initiated. Please wait...');
                 
                if (socketRef.current?.connected) {
                    socketRef.current?.emit('join_matchmaking_queue', {
                        userId: user.id,
                        elo: user.elo,
                        debateId: data.id // Use debateId from backend response
                    });
                } else {
                     toast({title:"Connection Error", description:"Socket not ready. Try again.", variant:"destructive"});
                     stopSearching(); 
                }
            }

        } catch (error) {
            console.error("Matchmaking initiation failed:", error);
            toast({
                title: "Matchmaking Error",
                description: `Could not start search: ${error instanceof Error ? error.message : "Unknown error"}`,
                variant: "destructive",
            });
            stopSearching(); 
        }
    };

    // --- Render ---
    return (
        <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4 text-white">
            {/* Back Button */}
            <div className="absolute top-4 left-4">
                <Button variant="ghost" onClick={() => navigate('/dashboard')} disabled={isSearching}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
            </div>

            {/* Main Card */}
            <Card className="max-w-md w-full bg-card/50 border-border/50 p-8 shadow-cyber">
                <CardHeader className="text-center border-b border-border/50 pb-4 mb-6">
                    <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center justify-center">
                        <Swords className="mr-3 h-7 w-7" /> Neural Matchmaking
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="text-center">
                        <p className="text-lg font-semibold text-foreground">
                            Current ELO: {user?.elo ?? '...'}
                        </p>
                    </div>

                    {!isSearching ? (
                        // Buttons Section
                        <div className="space-y-4">
                            <Button
                                size="lg"
                                className="w-full bg-cyber-red hover:bg-cyber-red/80 text-white font-semibold"
                                onClick={() => startMatchmaking(false)}
                                disabled={!user}
                            >
                                <Users className="mr-2 h-5 w-5" /> Debate a Human Opponent
                            </Button>
                            <Button
                                size="lg"
                                className="w-full bg-cyber-blue hover:bg-cyber-blue/80 text-white font-semibold"
                                onClick={() => startMatchmaking(true)}
                                disabled={!user}
                            >
                                <Bot className="mr-2 h-5 w-5" /> Debate the AI
                            </Button>
                        </div>
                    ) : (
                        // Searching Section
                        <div className="text-center space-y-4">
                            <div className="relative w-20 h-20 mx-auto">
                                <div className="absolute inset-0 border-4 border-cyber-gold/30 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-cyber-gold border-t-transparent rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center text-cyber-gold">
                                    <Swords className="h-10 w-10 animate-pulse" />
                                </div>
                            </div>
                            <p className="text-lg font-semibold text-foreground">
                                {statusMessage}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Topic: {topic || 'Determining topic...'}
                            </p>
                            <p className="text-sm font-mono text-cyber-red flex items-center justify-center">
                                <Clock className="h-4 w-4 mr-1" /> Elapsed: {formatTime(searchTime)}
                            </p>
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
